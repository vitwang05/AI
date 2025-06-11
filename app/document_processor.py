import os
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import Docx2txtLoader
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_pinecone import PineconeVectorStore
from pinecone import Pinecone, ServerlessSpec
from langchain.schema import Document
from app.config import *
import fitz  # PyMuPDF
import re
import json

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
    length_function=len,
)

embeddings = HuggingFaceEmbeddings(
    model_name=EMBEDDING_MODEL,
    model_kwargs={'device': 'cpu'},
    encode_kwargs={'normalize_embeddings': True}
)
def chunk_articles_with_metadata(text, document_name="Văn bản pháp luật"):
    def split_into_chapters(text):
        # Nếu không có chương, trả về một chương giả
        if not re.search(r'Chương\s+[IVXLCDM]+\.', text):
            return [("Không có chương", text.strip())]

        # Tách theo chương
        chapters = re.split(r'(Chương\s+[IVXLCDM]+\.\s+.+)', text)
        result = []
        for i in range(1, len(chapters), 2):
            chapter_title = chapters[i].strip()
            chapter_content = chapters[i + 1].strip()
            result.append((chapter_title, chapter_content))
        return result

    def split_into_articles(chapter_content):
        # Tách theo điều
        articles = re.split(r'(Điều\s+\d+\.\s+.+)', chapter_content)
        result = []
        for i in range(1, len(articles), 2):
            article_title = articles[i].strip()
            article_content = articles[i + 1].strip()
            full_article = article_title + "\n" + article_content
            result.append((article_title, full_article))
        return result

    chunks_with_metadata = []
    chapters = split_into_chapters(text)

    for chapter_title, chapter_content in chapters:
        articles = split_into_articles(chapter_content)
        for article_title, full_article in articles:
            chunks = text_splitter.split_text(full_article)
            for chunk in chunks:
                chunks_with_metadata.append({
                    "text": chunk,
                    "metadata": {
                        "program": document_name,
                        "chapter_title": chapter_title,
                        "article_title": article_title,
                        "article_number": re.search(r'Điều\s+(\d+)', article_title).group(1) if re.search(r'Điều\s+(\d+)', article_title) else None
                    }
                })

    return chunks_with_metadata
    
def setup_pinecone_index():
    pc = Pinecone(api_key=PINECONE_API_KEY)
    if PINECONE_INDEX_NAME not in pc.list_indexes().names():
        pc.create_index(
            name=PINECONE_INDEX_NAME,
            dimension=768,
            metric='cosine',
            spec=ServerlessSpec(cloud='aws', region='us-east-1')
        )
    return pc

def process_document(file_path):
    print(f"📄 Đang xử lý file: {file_path}")

    # Load nội dung file
    loader = Docx2txtLoader(file_path)
    documents = loader.load()

    # Ghép lại nội dung thành chuỗi lớn
    full_text = "\n".join([doc.page_content for doc in documents])

    # Tách chương > điều > chunk nhỏ
    splits = []
    chapter_article_chunks = chunk_articles_with_metadata(full_text, document_name=os.path.basename(file_path))

    for chunk in chapter_article_chunks:
        splits.append(Document(
            page_content=chunk["text"],
            metadata=chunk["metadata"]
        ))

    # Đưa vào Pinecone
    vectorstore = PineconeVectorStore.from_documents(
        documents=splits,
        embedding=embeddings,
        index_name=PINECONE_INDEX_NAME,
        pinecone_api_key=PINECONE_API_KEY
    )

    print(f"✅ Đã lưu {len(splits)} chunks vào Pinecone")
    return vectorstore


import re
import fitz  # PyMuPDF
# import docx

def extract_structured_terms(file_path, start_page, end_page):
    try:
        # Mở file dựa theo định dạng
        if file_path.lower().endswith('.pdf'):
            doc = fitz.open(file_path)
            if not doc:
                raise ValueError("Could not open PDF file")
            total_pages = len(doc)
            print(f"Total pages in PDF: {total_pages}")
        elif file_path.lower().endswith('.docx'):
            doc = Document(file_path)
            total_pages = len(doc.paragraphs)
            print(f"Total paragraphs in DOCX: {total_pages}")
        else:
            raise ValueError("Unsupported file format. Only PDF and DOCX files are supported.")

        # Kiểm tra phạm vi trang/đoạn văn
        if start_page < 1 or start_page > total_pages:
            raise ValueError(f"Start page {start_page} is out of range (1-{total_pages})")
        if end_page < start_page or end_page > total_pages:
            raise ValueError(f"End page {end_page} is out of range ({start_page}-{total_pages})")

        text = ""

        # Trích xuất text từ PDF
        if file_path.lower().endswith('.pdf'):
            for i in range(start_page - 1, end_page):
                try:
                    page = doc[i]
                    if page:
                        page_text = page.get_text()
                        if page_text:
                            text += page_text + "\n"
                            print(f"Successfully extracted text from page {i+1}")
                        else:
                            print(f"Warning: No text found on page {i+1}")
                    else:
                        print(f"Warning: Could not access page {i+1}")
                except Exception as e:
                    print(f"Error processing page {i+1}: {str(e)}")
        # Trích xuất text từ DOCX
        else:
            for i in range(start_page - 1, end_page):
                try:
                    para_text = doc.paragraphs[i].text
                    if para_text:
                        text += para_text + "\n"
                        print(f"Successfully extracted text from paragraph {i+1}")
                    else:
                        print(f"Warning: No text found in paragraph {i+1}")
                except Exception as e:
                    print(f"Error processing paragraph {i+1}: {str(e)}")

        if not text.strip():
            raise ValueError("No text content found in the specified page range")

        print(f"Extracted text length: {len(text)} characters")
        lines = text.splitlines()
        print(f"Number of lines: {len(lines)}")

        result = []
        current_term = None
        current_sub = None
        current_detail = None

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Điều khoản chính: "Điều 1:", "Điều 2."
            if re.match(r"^Điều\s+\d+[\.:]", line):
                # Kết thúc khối cũ
                if current_term:
                    if current_sub:
                        if current_detail:
                            current_sub["details"].append(current_detail)
                            current_detail = None
                        current_term["sub_items"].append(current_sub)
                        current_sub = None
                    result.append(current_term)
                current_term = {"title": line, "sub_items": []}
                current_sub = None
                current_detail = None

            # Mục 1.1, 2.3,...
            elif re.match(r"^\d+\.\d+", line):
                if current_term is None:
                    # Khởi tạo current_term mặc định nếu chưa có
                    current_term = {"title": "Không rõ tiêu đề", "sub_items": []}

                if current_sub:
                    if current_detail:
                        current_sub["details"].append(current_detail)
                        current_detail = None
                    current_term["sub_items"].append(current_sub)
                current_sub = {"title": line, "details": []}
                current_detail = None

            # Mục a), b), c)...
            elif re.match(r"^[a-zA-Z]\)", line):
                if current_term is None:
                    current_term = {"title": "Không rõ tiêu đề", "sub_items": []}

                if current_detail:
                    current_sub["details"].append(current_detail)
                current_detail = {"title": line, "sub_details": []}

            # Mục i), ii), iii)...
            elif re.match(r"^(i{1,3}|iv|v|vi|vii|viii|ix|x)\)", line, re.IGNORECASE):
                if current_detail:
                    current_detail["sub_details"].append(line)
                elif current_sub:
                    current_sub["details"].append({"title": line})

            # Mục - gạch đầu dòng
            elif re.match(r"^- ", line):
                if current_detail:
                    current_detail["sub_details"].append(line)
                elif current_sub:
                    current_sub["details"].append({"title": line})

            # Dòng nối tiếp
            else:
                # Nếu đang ở cấp sâu nhất (i) hoặc -), nối vào dòng cuối
                if current_detail and current_detail.get("sub_details"):
                    current_detail["sub_details"][-1] += " " + line
                # Nếu đang ở cấp a)
                elif current_detail:
                    current_detail["title"] += " " + line
                # Nếu chỉ có cấp 1.1
                elif current_sub:
                    current_sub["title"] += " " + line
                else:
                    # Không có cấp nào - có thể lưu thành term riêng hoặc bỏ qua
                    if current_term is None:
                        current_term = {"title": "Không rõ tiêu đề", "sub_items": []}
                    # Thêm dòng này vào title của current_term (hoặc tạo 1 sub mới)
                    # Ở đây mình chọn nối vào title để tránh mất dữ liệu
                    current_term["title"] += " " + line

        # Đóng các khối còn lại
        if current_detail:
            current_sub["details"].append(current_detail)
        if current_sub:
            current_term["sub_items"].append(current_sub)
        if current_term:
            result.append(current_term)

        if not result:
            raise ValueError("No structured content found in the text")

        print(f"Found {len(result)} terms in the text")
        return result

    except Exception as e:
        raise Exception(f"Error processing file: {str(e)}")

    try:
        # Open document based on file extension
        if file_path.lower().endswith('.pdf'):
            doc = fitz.open(file_path)
            if not doc:
                raise ValueError("Could not open PDF file")
            total_pages = len(doc)
            print(f"Total pages in PDF: {total_pages}")
        elif file_path.lower().endswith('.docx'):
            doc = Document(file_path)
            total_pages = len(doc.paragraphs)
            print(f"Total paragraphs in DOCX: {total_pages}")
        else:
            raise ValueError("Unsupported file format. Only PDF and DOCX files are supported.")

        # Validate page range
        if start_page < 1 or start_page > total_pages:
            raise ValueError(f"Start page {start_page} is out of range (1-{total_pages})")
        if end_page < start_page or end_page > total_pages:
            raise ValueError(f"End page {end_page} is out of range ({start_page}-{total_pages})")

        text = ""
        
        # Extract text from PDF
        if file_path.lower().endswith('.pdf'):
            for i in range(start_page - 1, end_page):
                try:
                    page = doc[i]
                    if page:
                        page_text = page.get_text()
                        if page_text:
                            text += page_text + "\n"
                            print(f"Successfully extracted text from page {i+1}")
                        else:
                            print(f"Warning: No text found on page {i+1}")
                    else:
                        print(f"Warning: Could not access page {i+1}")
                except Exception as e:
                    print(f"Error processing page {i+1}: {str(e)}")
        # Extract text from DOCX
        else:
            for i in range(start_page - 1, end_page):
                try:
                    para_text = doc.paragraphs[i].text
                    if para_text:
                        text += para_text + "\n"
                        print(f"Successfully extracted text from paragraph {i+1}")
                    else:
                        print(f"Warning: No text found in paragraph {i+1}")
                except Exception as e:
                    print(f"Error processing paragraph {i+1}: {str(e)}")

        if not text.strip():
            raise ValueError("No text content found in the specified page range")

        print(f"Extracted text length: {len(text)} characters")
        lines = text.splitlines()
        print(f"Number of lines: {len(lines)}")

        result = []
        current_term = None
        current_sub = None
        current_detail = None

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Điều khoản chính
            if re.match(r"^Điều\s+\d+[\.:]", line):
                if current_term:
                    if current_sub:
                        if current_detail:
                            current_sub["details"].append(current_detail)
                            current_detail = None
                        current_term["sub_items"].append(current_sub)
                        current_sub = None
                    result.append(current_term)
                current_term = {"title": line, "sub_items": []}

            # Mục 1.1, 2.3,...
            elif re.match(r"^\d+\.\d+", line):
                if current_sub:
                    if current_detail:
                        current_sub["details"].append(current_detail)
                        current_detail = None
                    current_term["sub_items"].append(current_sub)
                current_sub = {"title": line, "details": []}
                current_detail = None

            # Mục a), b), c)...
            elif re.match(r"^[a-zA-Z]\)", line):
                if current_detail:
                    current_sub["details"].append(current_detail)
                current_detail = {"title": line, "sub_details": []}

            # Mục i), ii), iii)...
            elif re.match(r"^(i{1,3}|iv|v|vi|vii|viii|ix|x)\)", line, re.IGNORECASE):
                if current_detail:
                    current_detail["sub_details"].append(line)
                elif current_sub:
                    current_sub["details"].append({"title": line})

            # Mục - gạch đầu dòng
            elif re.match(r"^- ", line):
                if current_detail:
                    current_detail["sub_details"].append(line)
                elif current_sub:
                    current_sub["details"].append({"title": line})

            # Dòng nối tiếp
            else:
                # Nếu đang ở cấp sâu nhất (i) hoặc -), nối vào dòng cuối
                if current_detail and current_detail.get("sub_details"):
                    current_detail["sub_details"][-1] += " " + line
                # Nếu đang ở cấp a)
                elif current_detail:
                    current_detail["title"] += " " + line
                # Nếu chỉ có cấp 1.1
                elif current_sub:
                    current_sub["title"] += " " + line

        # Đóng các khối còn lại
        if current_detail:
            current_sub["details"].append(current_detail)
        if current_sub:
            current_term["sub_items"].append(current_sub)
        if current_term:
            result.append(current_term)

        if not result:
            raise ValueError("No structured content found in the text")

        print(f"Found {len(result)} terms in the text")
        return result
    except Exception as e:
        raise Exception(f"Error processing file: {str(e)}")

# terms = extract_structured_terms("test.pdf", 6, 48)
# with open("output.json", "w", encoding="utf-8") as f:
#     json.dump(terms, f, ensure_ascii=False, indent=2)