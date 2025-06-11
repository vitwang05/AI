from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
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
    
    def process_item(item, parent_title=""):
        title = item.get("title", "")
        full_title = f"{parent_title} > {title}" if parent_title else title
        sub_items = item.get("sub_items", [])
        
        if not sub_items:
            answer, documents = answer_question(full_title, qa)
            printed_names = set()
            for doc in documents:
                law_name = doc.metadata.get('law_name', 'Unknown')
                if law_name not in printed_names:
                    printed_names.add(law_name)
                    
            results.append({
                "question": full_title,
                "answer": answer,
                "documents": list(printed_names)
            })
        else:
            for sub in sub_items:
                process_item(sub, full_title)
    
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
            raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

        # Lưu kết quả trung gian
        output_dir = "output"
        os.makedirs(output_dir, exist_ok=True)
        output_json = os.path.join(output_dir, "output.json")
        
        with open(output_json, "w", encoding="utf-8") as f:
            json.dump(structured_terms, f, ensure_ascii=False, indent=2)

        # Tạo chuỗi hỏi đáp
        try:
            qa_chain = create_qa_chain()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error creating QA chain: {str(e)}")

        # Đọc dữ liệu đã trích xuất
        try:
            with open(output_json, "r", encoding="utf-8") as f:
                json_data = json.load(f)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error reading output file: {str(e)}")

        # Xử lý dữ liệu JSON
        try:
            results = process_json(json_data, qa_chain)
            if not results:
                raise HTTPException(status_code=400, detail="No results generated from the content")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error processing JSON data: {str(e)}")

        # Ghi ra kết quả
        results_json = os.path.join(output_dir, "qa_results.json")
        try:
            with open(results_json, "w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error writing results file: {str(e)}")

        end_time = time.time()
        processing_time = end_time - start_time

        # Read the results file
        with open(results_json, "r", encoding="utf-8") as f:
            results_data = json.load(f)

        return {
            "results": results_data,
            "processing_time": processing_time
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@app.post("/generate-docx")
async def generate_docx():
    try:
        start_time = time.time()
        
        # Đọc file qa_results.json từ thư mục output
        output_dir = "output"
        results_file = os.path.join(output_dir, "qa_results.json")
        
        if not os.path.exists(results_file):
            raise HTTPException(status_code=404, detail="Không tìm thấy file kết quả. Vui lòng xử lý file trước.")
        
        with open(results_file, "r", encoding="utf-8") as f:
            qa_results = json.load(f)
        
        # Tạo document mới
        doc = Document()
        
        # Thêm tiêu đề
        title = doc.add_heading('Kết Quả Hỏi Đáp', 0)
        title.alignment = WD_ALIGN_PARAGRAPH.CENTER
        
        # Thêm từng cặp hỏi đáp
        for idx, qa in enumerate(qa_results, 1):
            # Thêm câu hỏi
            question = doc.add_paragraph()
            question.add_run(f'Câu hỏi {idx}: ').bold = True
            question.add_run(qa['question'])
            
            # Thêm câu trả lời
            answer = doc.add_paragraph()
            answer.add_run('Trả lời: ').bold = True
            answer.add_run(qa['answer'])
            
            # Thêm tài liệu tham khảo
            if qa['documents']:
                refs = doc.add_paragraph()
                refs.add_run('Tài liệu tham khảo: ').bold = True
                for doc_name in qa['documents']:
                    refs.add_run(f'\n- {doc_name}')
            
            # Thêm đường kẻ phân cách
            doc.add_paragraph('_' * 50)
        
        # Lưu file vào thư mục output
        output_file = os.path.join(output_dir, "qa_results.docx")
        doc.save(output_file)
        
        end_time = time.time()
        processing_time = end_time - start_time
        
        return FileResponse(
            output_file,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename="qa_results.docx",
            headers={
                "Content-Disposition": f"attachment; filename=qa_results.docx"
            }
        )
        
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi tạo file docx: {str(e)}")

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