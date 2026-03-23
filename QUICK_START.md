# Quick Start: AI-Powered TV Show Search

## 5-Minute Setup

### 1. Get Your API Keys

**Groq API Key** (Free):
1. Go to [console.groq.com](https://console.groq.com)
2. Sign up (free account)
3. Create an API key
4. Copy it

**TMDB Bearer Token** (You likely have this):
1. Already in your `.env` file as `TMDB_BEARER_TOKEN`

### 2. Update Environment

Edit `server/.env`:
```bash
GROQ_API_KEY=gsk_your_key_here
TMDB_BEARER_TOKEN=your_existing_token
```

### 3. Install Dependencies

```bash
# Backend
cd server
npm install

# Frontend  
cd client
npm install
```

### 4. Start Both Servers

```bash
# Terminal 1 - Backend
cd server
npm run start:dev

# Terminal 2 - Frontend
cd client
npm run dev
```

### 5. Test It

1. Open http://localhost:5173
2. Log in (or register)
3. Go to "Find Your Next Show"
4. Type: "I want a gripping drama with high ratings on Netflix"
5. Click Search
6. See results!

## What Changed

### Old System ❌
- Multi-slide form with checkboxes
- Select genres, networks, providers manually
- Complex UI with many options

### New System ✅
- Single text input: "I'm looking for..."
- AI understands your request
- Automatically finds matching shows

## Example Queries

### 👀 Simple
"Shows on Netflix"

### 🎬 Specific
"A comedy from South Korea with high ratings"

### 🎭 Detailed
"I want gripping crime drama series available in the US on HBO Max or Prime Video, with no graphic violence, preferably from the last 5 years"

## Architecture (Simple View)

```
Your Query
    ↓
Groq LLM (understands what you want)
    ↓
ID Resolver (finds Netflix → ID 8, Drama → ID 18, etc.)
    ↓
TMDB API (gets matching shows)
    ↓
Beautiful Results!
```

## Files Changed/Created

### New Files
- `server/src/tv/dto/natural-language-search.dto.ts` - Input validator
- `server/src/tv/natural-language-orchestration.service.ts` - AI + ID resolution
- `client/src/pages/PreferencesPageNL.css` - New UI styles
- `NATURAL_LANGUAGE_GUIDE.md` - Full documentation

### Modified Files
- `server/src/tv/tv.controller.ts` - Added `/discover-natural` endpoint
- `server/src/tv/tv.module.ts` - Registered new service
- `client/src/pages/PreferencesPage.tsx` - Simplified UI (removed old form)

### Still Works
- ✅ Watchlist (add/remove)
- ✅ Mark as watched
- ✅ Show details
- ✅ All existing features

## Troubleshooting

### "Groq API error"
→ Check your GROQ_API_KEY in `.env`

### "TMDB discover failed"
→ Check your TMDB_BEARER_TOKEN in `.env`

### "Invalid response format from LLM"
→ Try a different query (simpler phrasing)

### No results
→ Try: "Show me popular TV shows" (broader query)

## Next Steps

1. ✅ Deploy to production when ready
2. ✅ Share with other users
3. ✅ Monitor Groq/TMDB API usage
4. ✅ Add caching for better performance (optional)

## Performance Note

Each search uses ~6-12 TMDB API calls. If you get rate-limited:
- Add database caching
- Or wait 10 seconds between searches

---

**Questions?** Check [NATURAL_LANGUAGE_GUIDE.md](NATURAL_LANGUAGE_GUIDE.md) for detailed documentation.
