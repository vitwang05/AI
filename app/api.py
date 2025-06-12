from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Request, Response
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
import os
import json
from app.qa_chain import create_qa_chain, answer_question
from app.document_processor import process_document, setup_pinecone_index, extract_structured_terms
from typing import List, Dict, Optional
import tempfile
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
import time
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from collections import defaultdict

# Cấu hình JWT
SECRET_KEY = "your-secret-key"  # Thay đổi thành một key bảo mật trong môi trường production
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Cấu hình password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Model cho user
class User(BaseModel):
    username: str
    role: str

# Model cho token
class Token(BaseModel):
    access_token: str
    token_type: str

# Model cho user trong database
class UserInDB(User):
    hashed_password: str

# Mock database - trong môi trường production nên sử dụng database thật
fake_users_db = {
    "user": {
        "username": "user",
        "role": "user",
        "hashed_password": pwd_context.hash("user123")
    },
    "admin": {
        "username": "admin",
        "role": "admin",
        "hashed_password": pwd_context.hash("admin123")
    }
}

app = FastAPI()

# Cấu hình CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],  # Frontend URLs
    allow_credentials=True,
    allow_methods=["*"],  # Cho phép tất cả các HTTP methods
    allow_headers=["*"],  # Cho phép tất cả các headers
)

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# Hàm xác thực user
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_user(db, username: str):
    if username in db:
        user_dict = db[username]
        return UserInDB(**user_dict)
    return None

def authenticate_user(fake_db, username: str, password: str):
    user = get_user(fake_db, username)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = get_user(fake_users_db, username)
    if user is None:
        raise credentials_exception
    return user

@app.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(fake_users_db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

def process_json(data, qa):
    results = []
    
    def group_by_program(documents):
        result = defaultdict(list)
        for item in documents:
            result[item.metadata.get('program')].append({   
                "title": item.metadata.get('article_title'), 
                "text": item.page_content})
        return dict(result)
    
    def process_item(item, parent_title=""):
        title = item.get("title", "")
        full_title = f"{parent_title} > {title}" if parent_title else title
        sub_items = item.get("sub_items", [])
        
        if not sub_items:
            # Nếu không có sub_items, xử lý trực tiếp title
            answer, documents = answer_question(full_title, qa)
            grouped_documents = group_by_program(documents)
            results.append({
                "question": full_title,
                "answer": answer,
                "documents": grouped_documents
            })
        else:
            # Xử lý các sub_items
            for sub in sub_items:
                sub_title = sub.get("title", "")
                full_sub_title = f"{full_title} > {sub_title}"
                details = sub.get("details", [])
                
                if not details:
                    # Nếu không có details, xử lý sub_title
                    answer, documents = answer_question(full_sub_title, qa)
                    grouped_documents = group_by_program(documents)
                    results.append({
                        "question": full_sub_title,
                        "answer": answer,
                        "documents": grouped_documents
                    })
                else:
                    # Xử lý các details
                    for detail in details:
                        detail_title = detail.get("title", "")
                        full_detail_title = f"{full_sub_title} > {detail_title}"
                        sub_details = detail.get("sub_details", [])
                        
                        if not sub_details:
                            # Nếu không có sub_details, xử lý detail_title
                            answer, documents = answer_question(full_detail_title, qa)
                            grouped_documents = group_by_program(documents)
                            results.append({
                                "question": full_detail_title,
                                "answer": answer,
                                "documents": grouped_documents
                            })
                        else:
                            # Xử lý các sub_details
                            for sub_detail in sub_details:
                                full_sub_detail_title = f"{full_detail_title} > {sub_detail}"
                                answer, documents = answer_question(full_sub_detail_title, qa)
                                grouped_documents = group_by_program(documents)
                                results.append({
                                    "question": full_sub_detail_title,
                                    "answer": answer,
                                    "documents": grouped_documents
                                })
    
    # Xử lý từng item trong danh sách
    if isinstance(data, list):
        for item in data:
            process_item(item)
    else:
        process_item(data)
    
    return results

@app.post("/uploadVBPL")
async def upload_fileVBPL(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin users can upload VBPL files"
        )
    try:
        temp_dir = "VBPL"
        os.makedirs(temp_dir, exist_ok=True)
        file_path = os.path.join(temp_dir, file.filename)
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        return {
            "message": "File uploaded successfully",
            "filename": file.filename,
            "file_path": file_path.replace("\\", "/")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi upload file: {str(e)}")

@app.post("/learn")
async def learn_file(
    file_path: str,
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin users can learn files"
        )
    try:
        start_time = time.time()
        # Convert URL-encoded path back to normal path
        file_path = file_path.replace("%2F", "/")
        
        # Kiểm tra file tồn tại
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

        # Kiểm tra file có phải là PDF hoặc DOCX không
        if not file_path.lower().endswith(('.pdf', '.docx')):
            raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported")
        
        process_document(file_path)
        
        end_time = time.time()
        processing_time = end_time - start_time
        
        return {
            "message": "File processed successfully"
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
  
@app.post("/uploadVBNB")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    try:
        # Create temp directory if it doesn't exist
        temp_dir = "temp"
        os.makedirs(temp_dir, exist_ok=True)
        
        # Save uploaded file
        file_path = os.path.join(temp_dir, file.filename)
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        return {
            "message": "File uploaded successfully",
            "filename": file.filename,
            "file_path": file_path.replace("\\", "/")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi upload file: {str(e)}")

@app.post("/process")
async def process_file(
    file_path: str,
    start_page: int,
    end_page: int,
    current_user: User = Depends(get_current_user)
):
    try:
        start_time = time.time()
        # Convert URL-encoded path back to normal path
        file_path = file_path.replace("%2F", "/")
        
        # Kiểm tra file tồn tại
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

        # Kiểm tra file có phải là PDF hoặc DOCX không
        if not file_path.lower().endswith(('.pdf', '.docx')):
            raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported")

        # Kiểm tra số trang hợp lệ
        if start_page < 1 or end_page < start_page:
            raise HTTPException(status_code=400, detail="Invalid page range")

        # Gọi hàm xử lý văn bản
        try:
            structured_terms = extract_structured_terms(file_path, start_page, end_page)
            if not structured_terms:
                raise HTTPException(status_code=400, detail="No content found in the specified page range")
        except Exception as e:
            print(f"Error extracting structured terms: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

        # Lưu kết quả trung gian vào thư mục temp
        temp_dir = "json_output"
        os.makedirs(temp_dir, exist_ok=True)
        output_json = os.path.join(temp_dir, "output.json")
        
        with open(output_json, "w", encoding="utf-8") as f:
            json.dump(structured_terms, f, ensure_ascii=False, indent=2)

        # Tạo chuỗi hỏi đáp
        try:
            qa_chain = create_qa_chain()
        except Exception as e:
            print(f"Error creating QA chain: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error creating QA chain: {str(e)}")

        # Đọc dữ liệu đã trích xuất
        try:
            with open(output_json, "r", encoding="utf-8") as f:
                json_data = json.load(f)
        except Exception as e:
            print(f"Error reading output file: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error reading output file: {str(e)}")

        # Xử lý dữ liệu JSON
        try:
            results = process_json(json_data, qa_chain)
            if not results:
                raise HTTPException(status_code=400, detail="No results generated from the content")
        except Exception as e:
            print(f"Error processing JSON data: {str(e)}")
            print(f"JSON data: {json.dumps(json_data, indent=2)}")
            raise HTTPException(status_code=500, detail=f"Error processing JSON data: {str(e)}")

        # Lưu kết quả cuối cùng vào thư mục output
        output_dir = "output"
        os.makedirs(output_dir, exist_ok=True)
        
        # Lấy tên file gốc
        original_filename = os.path.basename(file_path)
        # Tạo timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        # Tạo tên file kết quả
        results_filename = f"{os.path.splitext(original_filename)[0]}_{timestamp}.json"
        results_json = os.path.join(output_dir, results_filename)
        
        try:
            with open(results_json, "w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error writing results file: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error writing results file: {str(e)}")

        end_time = time.time()
        processing_time = end_time - start_time
        
        return {
            "results": results,
            "processing_time": processing_time,
            "filename": results_filename
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@app.get("/process-results")
async def get_process_results():
    try:
        output_dir = "output"
        if not os.path.exists(output_dir):
            return []
            
        results = []
        for filename in os.listdir(output_dir):
            if filename.endswith('.json'):
                file_path = os.path.join(output_dir, filename)
                modified_time = os.path.getmtime(file_path)
                results.append({
                    "filename": filename,
                    "modified_time": modified_time
                })
        
        # Sắp xếp theo thời gian sửa đổi mới nhất
        results.sort(key=lambda x: x["modified_time"], reverse=True)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/process-results/{filename}")
async def get_process_result(
    filename: str,
    current_user: User = Depends(get_current_user)
):
    try:
        output_dir = "output"
        # Tìm file có chứa tên file gốc trong tên
        matching_files = [f for f in os.listdir(output_dir) if filename in f and f.endswith('.json')]
        
        if not matching_files:
            raise HTTPException(status_code=404, detail="Result not found")
        
        # Lấy file đầu tiên khớp với tên file
        results_file = os.path.join(output_dir, matching_files[0])
        
        with open(results_file, "r", encoding="utf-8") as f:
            results_data = json.load(f)
            
        return {
            "filename": filename,
            "results": results_data
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading results: {str(e)}")

@app.post("/generate-docx")
async def generate_docx(request: Request):
    try:
        data = await request.json()
        filename = data.get('filename')
        print(f"Received request for filename: {filename}")
        
        if not filename:
            raise HTTPException(status_code=400, detail="Filename is required")

        # Tìm file trong thư mục output
        output_dir = "output"
        matching_files = [f for f in os.listdir(output_dir) if f.endswith('.json') and filename in f]
        
        if not matching_files:
            print(f"No matching files found for: {filename}")
            raise HTTPException(status_code=404, detail="Result file not found")
            
        # Lấy file đầu tiên tìm thấy
        result_file = matching_files[0]
        json_path = os.path.join(output_dir, result_file)
        print(f"Found matching file: {json_path}")

        # Đọc file JSON
        with open(json_path, 'r', encoding='utf-8') as f:
            results = json.load(f)
        print(f"Successfully loaded JSON data with {len(results)} results")

        # Tạo file DOCX
        doc = Document()
        
        # Thêm tiêu đề
        doc.add_heading('Kết quả phân tích', 0)
        
        # Thêm từng câu hỏi và câu trả lời
        for result in results:
            # Thêm câu hỏi
            doc.add_heading(result['question'], level=1)
            
            # Thêm câu trả lời
            doc.add_paragraph(result['answer'])
            
            # Thêm tài liệu tham khảo nếu có
            if result.get('documents'):
                doc.add_heading('Tài liệu tham khảo:', level=2)
                for source, docs in result['documents'].items():
                    doc.add_paragraph(f'Nguồn: {source}', style='Heading 3')
                    for doc_item in docs:
                        doc.add_paragraph(doc_item['text'])
            
            # Thêm đường kẻ phân cách
            doc.add_paragraph('_' * 50)

        # Lưu file DOCX tạm thời
        TEMP_DIR = "temp_docx"
        os.makedirs(TEMP_DIR, exist_ok=True)
        temp_docx_path = os.path.join(TEMP_DIR, f"{os.path.splitext(result_file)[0]}.docx")
        print(f"Saving DOCX to temporary path: {temp_docx_path}")
        doc.save(temp_docx_path)

        # Đọc file DOCX và trả về
        with open(temp_docx_path, 'rb') as f:
            docx_content = f.read()

        # Xóa file tạm
        os.remove(temp_docx_path)

        # Trả về file DOCX
        return Response(
            content=docx_content,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": f"attachment; filename={os.path.splitext(result_file)[0]}.docx"
            }
        )

    except Exception as e:
        print(f"Error generating DOCX: {str(e)}")
        print(f"Error type: {type(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/files")
async def get_files(
    directory: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    try:
        if directory == "VBPL" and current_user.role != "admin":
            raise HTTPException(
                status_code=403,
                detail="Only admin users can access VBPL files"
            )

        if directory:
            dir_path = directory
        else:
            dir_path = "temp"

        if not os.path.exists(dir_path):
            return {directory: []}

        files = []
        for filename in os.listdir(dir_path):
            file_path = os.path.join(dir_path, filename)
            if os.path.isfile(file_path):
                stat = os.stat(file_path)
                files.append({
                    "name": filename,
                    "path": file_path.replace("\\", "/"),
                    "size": stat.st_size,
                    "modified": stat.st_mtime
                })

        return {directory: files}
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting files: {str(e)}")

@app.delete("/files")
async def delete_file(
    path: str,
    current_user: User = Depends(get_current_user)
):
    try:
        # Convert URL-encoded path back to normal path
        path = path.replace("%2F", "/")
        
        # Kiểm tra quyền xóa file
        if path.startswith("VBPL/") and current_user.role != "admin":
            raise HTTPException(
                status_code=403,
                detail="Only admin users can delete VBPL files"
            )

        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail="File not found")

        os.remove(path)
        return {"message": "File deleted successfully"}
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting file: {str(e)}")