import os
from dotenv import load_dotenv

load_dotenv()
EMBEDDING_MODEL = "bkai-foundation-models/vietnamese-bi-encoder"
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = "test"
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
CHUNK_SIZE = 500
CHUNK_OVERLAP = 200