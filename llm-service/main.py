"""
LLM Service — Context Graph System (Advanced)
==============================================
- Conversational business answers (Summarization)
- Persistent session logging
- Groq-powered query translation
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Any
import os
import json
import time
import logging
import requests
from dotenv import load_dotenv

load_dotenv()

# ─── Config ────────────────────────────────────────────────────────────────────
GRAPH_SERVICE_URL = os.getenv("GRAPH_SERVICE_URL", "http://localhost:5000")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("llm-service")

# ─── FastAPI App ───────────────────────────────────────────────────────────────
app = FastAPI(title="LLM Service", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Schema & Prompts ──────────────────────────────────────────────────────────
GRAPH_SCHEMA = """
SAP Order-to-Cash (O2C) Database Schema:
- Collection: "nodes" (Fields: id, type, metadata)
- Types: Order, Delivery, Invoice, Payment, Customer, Product, Address
- Collection: "edges" (Fields: source, target, relationship)
"""

SYSTEM_PROMPT = GRAPH_SCHEMA + """
YOUR TASK: Convert user NL to a structured MongoDB JSON query.
STRICT RULES:
1. Return ONLY JSON. JSON must have: {"type": "aggregation"|"find"|"traversal", "collection": "nodes"|"edges", "query": {...}}
2. "type": "aggregation" requires "pipeline" array.
3. ALWAYS include "id" in your results.
4. If invalid, return {"type":"rejected", "reason":"..."}
"""

SUMMARIZE_PROMPT = """
You are a business analyst. Summarize the SAP O2C data provided based on the user's question.
- Be professional and concise.
- Use bullet points if multiple items are found.
- Limit to 80 words.
"""

# ─── Models ───────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    query: str

class ChatResponse(BaseModel):
    query: str
    structured_query: Optional[dict] = None
    results: Optional[list] = None
    answer: Optional[str] = None
    count: Optional[int] = None
    error: Optional[str] = None

# ─── Helpers ───────────────────────────────────────────────────────────────────

def call_llm(user_query: str) -> dict:
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_query}
        ],
        "temperature": 0.0,
        "response_format": {"type": "json_object"}
    }
    resp = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]

def generate_answer(query: str, data: list) -> str:
    if not data: return "No matching data found in the system."
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": SUMMARIZE_PROMPT},
            {"role": "user", "content": f"Query: {query}\nData: {json.dumps(data[:10])}"}
        ],
        "temperature": 0.5
    }
    try:
        resp = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload, timeout=20)
        return resp.json()["choices"][0]["message"]["content"]
    except:
        return f"Found {len(data)} results matching your search."

def log_session(query: str, structured: dict, count: int):
    log_file = "logs/chat_sessions.jsonl"
    os.makedirs("logs", exist_ok=True)
    with open(log_file, "a") as f:
        f.write(json.dumps({"t": time.ctime(), "q": query, "s": structured, "c": count}) + "\n")

# ─── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    try:
        # 1. Translate
        raw_llm = call_llm(request.query)
        structured = json.loads(raw_llm)
        if structured.get("type") == "rejected":
             return ChatResponse(query=request.query, answer=structured.get("reason"))

        # 2. Execute
        q_type = structured["type"]
        q_body = structured["query"]
        col = structured.get("collection", "nodes")
        
        if q_type == "traversal":
            resp = requests.get(f"{GRAPH_SERVICE_URL}/api/graph/traverse/{q_body['nodeId']}", timeout=15)
        else:
            # Send the entire query body directly
            payload = {
                "collection": col,
                "type": q_type,
                "query": q_body
            }
            resp = requests.post(f"{GRAPH_SERVICE_URL}/api/graph/execute-query", json=payload, timeout=15)
        
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results") or data.get("nodes") or []
        
        # 3. Summarize & Log
        log_session(request.query, structured, len(results))
        answer = generate_answer(request.query, results)

        return ChatResponse(
            query=request.query,
            structured_query=structured,
            results=results[:50],
            count=len(results),
            answer=answer
        )
    except Exception as e:
        logger.error(f"Chat failed: {e}")
        return ChatResponse(query=request.query, error=str(e), answer="I encountered an error processing your request.")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)
