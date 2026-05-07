# Lead Miner - AI-Powered Business Lead Generation

A premium, single-page web application (SPA) built with Python, FastAPI, and Firecrawl to systematically extract high-quality, targeted business leads. It leverages AI agents to discover businesses within specific niches, extract structured contact information, and manage lead datasets through an interactive dashboard.

## ✨ Features

- **AI-Powered Discovery**: Integrates with Firecrawl's agentic extraction (`spark-1-mini`) to find leads based on niche, industry, and location.
- **Structured Data Extraction**: Automatically extracts business names, contact persons, phone numbers, emails, websites, and LinkedIn profiles.
- **Premium SPA Dashboard**: A modern, glassmorphism-themed interface for managing the entire lead generation lifecycle.
- **Tabbed Workspace**: Browser-style tab management allowing you to run crawls and view multiple CSV datasets simultaneously.
- **Dynamic CSV Viewer**: Interactive table for browsing extracted leads with sorting, external links, and record counts.
- **Secure by Design**: Implements CSRF protection, security headers, and rate limiting for robust production-ready usage.
- **Export Ready**: Every crawl generates a clean CSV file in the `output/` directory for use in CRM or outreach tools.

## 🛠️ Tech Stack

- **Backend**: Python 3.12+, FastAPI, Uvicorn
- **AI Agent**: [Firecrawl](https://firecrawl.dev) (`firecrawl-py`)
- **Frontend**: Vanilla JavaScript (ES6+), Modern CSS (Glassmorphism), HTML5
- **Data Validation**: Pydantic v2
- **Security**: Python-dotenv, Secrets

## ⚙️ Setup Instructions

### 1. Clone the Repository
```bash
git clone https://github.com/aporiya/lead-miner-gen.git
cd lead-miner-gen
```

### 2. Configure Environment
Create a `.env` file in the root directory (refer to `.env.example`):
```env
FIRECRAWL_API_KEY=your_api_key_here
```

### 3. Install Dependencies
```bash
# It is recommended to use a virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

### 4. Run the Application
```bash
uvicorn main:app --reload
```
Navigate to `http://localhost:8000` to access the Lead Miner dashboard.

## 📁 Project Structure

```text
├── output/              # Generated lead datasets (CSV)
├── static/              # SPA Frontend (HTML, CSS, JS)
│   ├── index.html       # Application entry point
│   ├── app.css          # Premium dashboard styles
│   └── app.js           # SPA logic and tab management
├── .env.example         # Environment template
├── leadgen.py           # Core extraction & CSV logic
├── main.py              # FastAPI server & API endpoints
├── requirements.txt     # Python dependencies
└── LICENSE              # MIT License
```

## 🔒 Security

This application implements several security best practices:
- **CSRF Protection**: Stateful token validation for all mutation requests.
- **Security Headers**: nosniff, DENY frame options, and strict-origin referrer policies.
- **Sanitized I/O**: Filename sanitization and path traversal prevention for file downloads.
- **Rate Limiting**: Simple in-memory rate limiting to prevent API abuse.

## ⚖️ License

Distributed under the MIT License. See `LICENSE` for more information.
