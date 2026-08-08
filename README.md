# ULTRON AI

A futuristic full-stack AI assistant with:
- secure user authentication
- encrypted Groq API-key storage
- chat history
- voice typing
- text-to-speech
- GitHub Pages frontend
- Render backend + PostgreSQL

## Architecture

Frontend (React + Vite + Tailwind-style CSS) runs on GitHub Pages and talks only to the backend API.  
Backend (Flask + PostgreSQL) stores encrypted API keys, authenticates users, and proxies AI requests to Groq.

## Features

- Register / login / logout
- Secure password hashing
- Encrypted Groq API-key vault
- Multi-chat history
- Markdown responses and code blocks
- Voice typing with browser SpeechRecognition
- TTS with SpeechSynthesis
- Command bar support
- Responsive mobile-first layout

## Security model

- The frontend never calls Groq directly.
- The frontend never stores secrets in source code.
- Groq API keys are encrypted on the backend with AES-256-GCM.
- Encryption key stays only in Render environment variables.
- Raw API keys are never returned to the browser.
- Auth uses signed JWTs in secure httpOnly cookies.
- Protected endpoints require authentication.

## Local development

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python app.py
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## Environment variables

### backend/.env
- DATABASE_URL
- SECRET_KEY
- JWT_SECRET
- ENCRYPTION_KEY
- FRONTEND_URL
- CORS_ORIGINS
- GITHUB_PAGES_ORIGIN
- GROQ_DEFAULT_MODEL

### frontend/.env
- VITE_API_URL
- VITE_APP_NAME

## Render deployment

1. Create a PostgreSQL database on Render.
2. Create a Web Service from the backend folder.
3. Use:
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn app:app`
4. Add environment variables from `backend/.env.example`.
5. Set `FRONTEND_URL` to your GitHub Pages URL.

## GitHub Pages deployment

1. Build the frontend:
   ```bash
   cd frontend
   npm run build
   ```
2. Publish the `dist/` folder to GitHub Pages.
3. Set `VITE_API_URL` to your Render backend URL before building.

## API endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/api-key`
- `GET /api/api-key/status`
- `DELETE /api/api-key`
- `POST /api/chat`
- `GET /api/chats`
- `POST /api/chats`
- `PATCH /api/chats/:id`
- `DELETE /api/chats/:id`
- `GET /api/health`

## Notes

- GitHub Pages is static hosting. Never commit private API secrets there.
- Frontend env values are public after build, so only public config belongs there.
- 
