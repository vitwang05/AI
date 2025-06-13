from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_pinecone import PineconeVectorStore
from app.config import *
from app.document_processor import embeddings
import time
qa_prompt = PromptTemplate(
    input_variables=["context", "question"],
    template="""
Bạn là một trợ lý thông minh. Hãy sử dụng thông tin dưới đây để trả lời câu hỏi.
Nếu không tìm thấy câu trả lời trong thông tin, hãy nói "Không tìm thấy tài liệu liên quan".

Thông tin:
{context}

Câu hỏi:
Đánh giá điều luật, quyết định, quy định hoặc quy chế được cung cấp dưới đây:
{question}

Yêu cầu
- Đánh giá mức độ phù hợp trên 3 mức: phù hợp, không phù hợp, cần xem xét thêm.
- Lý do đánh giá.
- Nếu không phù hợp gợi ý sửa đổi.

Trả lời:
""".strip()
)

llm = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash",
    google_api_key=GOOGLE_API_KEY,
    temperature=0.01
)

def create_qa_chain():
    vectorstore = PineconeVectorStore.from_existing_index(
        index_name=PINECONE_INDEX_NAME,
        embedding=embeddings
    )
    retriever = vectorstore.as_retriever(search_type="similarity", search_kwargs={"k": 5})

    qa_chain = RetrievalQA.from_chain_type(
        llm=llm,
        chain_type="stuff",
        retriever=retriever,
        return_source_documents=True,
        verbose=True,
        chain_type_kwargs={"prompt": qa_prompt}
    )
    return qa_chain

def answer_question(question, qa_chain):
    time.sleep(5)
    result = qa_chain({"query": question})
    return result["result"], result["source_documents"]
