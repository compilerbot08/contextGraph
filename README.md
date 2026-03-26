# 🧠 Context Graph System

## 1. Project Overview

The **Context Graph System** is an intelligent, microservices-based data visualization and querying platform built over an SAP Order-to-Cash (O2C) dataset. Rather than querying flat, disconnected tables, the system models the data as a deeply interconnected **Graph**. 

**Why Graph Modeling?** 
Business processes are inherently relational (`Customer → Order → Delivery → Invoice → Payment`). By modeling entities as *Nodes* and transitions as *Edges*, we can instantly traverse the entire lifecycle of a transaction, discover bottlenecks, and visualize the exact state of operations in real-time.

---

## 2. Architecture Design

The system is split into four decoupled microservices to separate concerns (UI, Routing, Data, Intelligence).

![System Architecture Roadmap](file:///C:/Users/ashis/.gemini/antigravity/brain/9e7da40e-73c8-45a1-9fd5-fa0bc3e8de81/system_architecture_roadmap_1774519111481.png)

- **`frontend` (React + React Flow):** The interactive UI with hierarchical graph visualization and AI chat sidebar.
- **`api-gateway` (Node.js/Express):** Orchestrates traffic between the frontend and backends.
- **`graph-service` (Node.js + MongoDB):** The core data engine serving graph topology and BFS traversals.
- **`llm-service` (Python + Groq/Llama-3):** Translates human questions into executable MongoDB JSON queries safely.

---

## 3. LLM Prompting Strategy & Data Grounding

The fundamental philosophy of the Context Graph System is **Strict Data Grounding**. 

![AI Query Workflow](file:///C:/Users/ashis/.gemini/antigravity/brain/9e7da40e-73c8-45a1-9fd5-fa0bc3e8de81/ai_query_workflow_1774519173966.png)

To eliminate hallucination, the `llm-service` treats the LLM exclusively as a **stateless, reasoning-based translation engine**. It does not generate answers; it generates *executable search instructions*.

### Why Enforce Query-Only Output?
- **Zero Hallucination:** If the data doesn't exist in the database, the system returns 0 results instead of "guessing."
- **Data Freshness:** Results are retrieved dynamically from the database, ensuring up-to-the-second accuracy.

---

## 4. Features

- **🚀 Floating Force-Directed Layout:** Search results organicially scatter across the plane to prevent node stacking.
- **🔍 Interactive Auto-Zoom:** The graph automatically centers and zooms into search hits for immediate focus.
- **🎯 Universal ID Matcher:** Robust filtering that handles strings, numbers, and multiple identifier fields.
- **🌓 Theme Synchronicity:** Full Light/Dark mode support across the entire graph ecosystem and chat UI.
- **📜 Session Logs:** Every interaction is logged server-side for auditing and performance tuning.

---

## 5. Setup & Execution

### 📥 1. Ingest Data
```bash
cd graph-service
node src/ingest.js # Populates MongoDB from /dataset
```

### 🏁 2. Start Services
Run the automated startup script in the root directory:
```bash
# Windows
.\start_all.bat
```
*This script automatically sanitizes ports 4000, 5000, 8000, and 5173 before launching.*

---

## 6. Example Queries

Try these in the Chat Sidebar:
1. *"Find orders without deliveries"*
2. *"Which products have the highest invoice value?"*
3. *"Trace the full lifecycle of order 740510"*

---
Developed with ❤️ by the Context Graph Team.
