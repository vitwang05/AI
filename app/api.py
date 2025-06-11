from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import json
from app.qa_chain import create_qa_chain, answer_question
from app.document_processor import process_document, setup_pinecone_index, extract_structured_terms
from typing import List, Dict
import tempfile
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
import time

app = FastAPI()

# Cấu hình CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],  # Cho phép tất cả các HTTP methods
    allow_headers=["*"],  # Cho phép tất cả các headers
)

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
async def upload_fileVBPL(file: UploadFile = File()):
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
async def learn_file(file_path: str):
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
async def upload_file(file: UploadFile = File(...)):
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
async def process_file(file_path: str, start_page: int, end_page: int):
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