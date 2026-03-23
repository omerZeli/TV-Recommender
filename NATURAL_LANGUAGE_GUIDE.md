# AI-Powered Natural Language TV Show Search - Implementation Guide

## Overview

Your TV Recommender application has been refactored to use **AI-powered natural language search** instead of complex multi-step forms. Users can now describe what they're looking for in plain English, and the system intelligently extracts search parameters, resolves them to TMDB IDs, and retrieves matching shows.

## Architecture

### High-Level Flow

```
1. User Input
   └─ User enters natural language query in React client
      Example: "I'm looking for a gripping drama series on Netflix, nothing graphic"

2. Server Reception
   └─ Client POSTs to `/api/tv/discover-natural` with query text

3. AI Processing (LLM)
   └─ Groq API parses natural language → structured parameters
      - Extracts genres, networks, keywords, filters
      - Low temperature (0.3) for consistent output

4. ID Resolution (CRITICAL ORCHESTRATION LAYER)
   └─ NaturalLanguageOrchestrationService resolves names to TMDB IDs:
      - "Netflix" → Provider ID 8
      - "Drama" → Genre ID 18
      - "HBO" → Network ID 49
      
5. TMDB Discover Call
   └─ Final discover/tv request with numeric IDs
   └─ Return results to client

6. UI Display
   └─ React displays cards with watchlist/watched toggles (unchanged)
```

## Setup & Configuration

### 1. Environment Variables

Add these to your `.env` file (server):

```bash
GROQ_API_KEY=your_groq_api_key_here
TMDB_BEARER_TOKEN=your_tmdb_bearer_token_here
```

### 2. Groq API Setup

1. Visit [https://console.groq.com](https://console.groq.com)
2. Sign up for a free account
3. Generate an API key
4. Use `mixtral-8x7b-32768` model (free tier available)

**Cost**: Groq's free tier includes substantial tokens/month

### 3. TMDB API Setup

You likely already have this configured. Ensure you have:
- TMDB_BEARER_TOKEN from [https://www.themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)

## Backend Implementation Details

### New Files Created

#### 1. **[server/src/tv/dto/natural-language-search.dto.ts](server/src/tv/dto/natural-language-search.dto.ts)**
- `NaturalLanguageSearchDto`: Validates user input (10-1000 chars)
- `ParsedDiscoverParams`: Type-safe interface for LLM output
- `IdResolutionConfig`: Configuration for ID lookup endpoints

#### 2. **[server/src/tv/natural-language-orchestration.service.ts](server/src/tv/natural-language-orchestration.service.ts)**
Core orchestration service with four main responsibilities:

**a) LLM Parsing** (`parseWithLlm`)
- Sends query to Groq with strict system prompt
- Returns JSON with extracted parameters
- Validates JSON parsing

**b) ID Resolution Methods**
- `resolveGenreIds()`: Fetches genre list from TMDB, fuzzy matches names
- `resolveNetworkIds()`: Searches `/search/company` endpoint
- `resolveProviderIds()`: Searches `/watch/providers/tv` endpoint
- `resolveKeywordIds()`: Searches `/search/keyword` endpoint

**c) Main Orchestrator** (`orchestrateDiscoverParameters`)
- Converts parsed text parameters (e.g., "Netflix") → numeric IDs
- Converts ID names (e.g., genres) → numeric arrays
- Handles defaults and validation
- Returns strictly typed discover params

**d) Pipeline** (`processNaturalLanguageQuery`)
- Orchestrates all steps end-to-end
- Logs at each stage for debugging

### Modified Files

#### 1. **[server/src/tv/tv.controller.ts](server/src/tv/tv.controller.ts)**
New endpoint:
```typescript
@Post('discover-natural')
async discoverNatural(@Body() dto: NaturalLanguageSearchDto) {
  const discoverParams = await this.nlService.processNaturalLanguageQuery(dto.query);
  return this.tvService.discover(discoverParams);
}
```

#### 2. **[server/src/tv/tv.module.ts](server/src/tv/tv.module.ts)**
Added `NaturalLanguageOrchestrationService` to providers

## Frontend Implementation Details

### New Files

#### 1. **[client/src/pages/PreferencesPageNL.css](client/src/pages/PreferencesPageNL.css)**
- New CSS for simplified natural language UI
- Grid layouts for results
- Hover states and animations
- Fully responsive design

### Modified Files

#### 1. **[client/src/pages/PreferencesPage.tsx](client/src/pages/PreferencesPage.tsx)**

**Major Changes:**
- Removed complex multi-slide form (STATUS, TYPE, language checkboxes)
- Replaced with single textarea for natural language input
- Added suggestion examples (optional)
- Kept watchlist/watched toggle functionality

**Key Functions:**
```typescript
handleSearchWithNaturalLanguage(e): 
  - Validates min 10 chars
  - POSTs to /api/tv/discover-natural
  - Sets results

handleAddToWatchlist/handleRemoveFromWatchlist:
  - Same as before (unchanged)

handleMarkAsWatched:
  - Same as before (unchanged)
```

## Key Design Decisions

### 1. **LLM Strictness (Temperature = 0.3)**
- Low temperature ensures consistent formatting
- Reduces hallucinations
- Better JSON structure reliability

### 2. **ID Resolution Caching**
- Future optimization: cache genre/network/provider IDs
- Reduces API calls on repeated names
- Currently prepared in codebase structure

### 3. **TMDB Watch Provider Handling**
- Requires `watch_region` when using `with_watch_providers`
- Defaults to 'US' if not specified
- Supports multi-region queries (client-side merging in discover)

### 4. **Graceful Degradation**
- If LLM can't parse a term → omit that parameter
- If ID lookup fails → skip that facet
- Discover still returns results with partial filters

## Example User Queries

### Query 1: Streaming Services
```
"I want to watch gripping drama series available on Netflix or HBO Max, 
 preferably with high ratings, nothing too violent"
```
→ Extracts: genres: Drama, providers: Netflix/HBO Max, vote_average: >7.0

### Query 2: Genre & Language
```
"Japanese anime that's lighthearted and fun for all ages"
```
→ Extracts: genres: Animation, original_language: ja, keywords: family-friendly

### Query 3: Specific Network
```
"BBC or ITV shows from the UK in the last 10 years"
```
→ Extracts: networks: BBC/ITV, origin_country: GB, first_air_date: recent

## Testing the Integration

### 1. Start Servers
```bash
# Terminal 1: Server
cd server
npm install  # if first time
npm run start:dev

# Terminal 2: Client
cd client
npm install  # if first time
npm run dev
```

### 2. Configure Environment
```bash
# Create .env in server/ directory
GROQ_API_KEY=gsk_xxxxx
TMDB_BEARER_TOKEN=Bearer xxxxx
DATABASE_URL=your_db_url
JWT_SECRET=your_jwt_secret
```

### 3. Test the Endpoint

**Using cURL:**
```bash
curl -X POST http://localhost:3000/api/tv/discover-natural \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_jwt_token" \
  -d '{
    "query": "I want a gripping crime drama with high ratings on a streaming service"
  }'
```

**Expected Response:**
```json
{
  "page": 1,
  "results": [
    {
      "id": 1396,
      "name": "Breaking Bad",
      "overview": "...",
      "poster_path": "/...",
      "first_air_date": "2008-01-20",
      "vote_average": 9.5
    },
    ...
  ],
  "total_pages": 5,
  "total_results": 95
}
```

### 4. Debugging

All logging is done via `console.log` at these stages:
1. After LLM parsing: Shows extracted parameters
2. After ID resolution: Shows resolved numeric IDs
3. After orchestration: Shows final discover params

Enable browser DevTools and check both client and server logs.

## API Endpoints

### New Endpoint

**POST `/api/tv/discover-natural`**

**Request:**
```json
{
  "query": "string (min 10, max 1000 chars)"
}
```

**Response:**
Same as `/api/tv/discover` (standard TMDB discover response)

**Error Handling:**
- 400: Query too short/long
- 502: LLM parsing failed (Groq API issue)
- 502: TMDB ID resolution failed
- 502: TMDB discover call failed

## Performance Considerations

### API Calls Per Query
1. Groq API: 1 call
2. TMDB Calls (varies):
   - Genre list: 1 call
   - Each network: 1 call (e.g., Netflix, HBO = 2 calls)
   - Each provider: included in genre list call
   - Each keyword: 1 call
   - Final discover: 1 call

**Typical total: 6-12 TMDB API calls per search**

### Optimization Opportunities
- Add Redis caching for genre/network/provider lists
- Cache LLM-to-IDs mappings
- Batch ID resolution requests
- Use TMDB configuration endpoint

## Troubleshooting

### "Failed to process natural language query with LLM"
**Cause**: Groq API key invalid or quota exceeded
**Solution**: 
- Check GROQ_API_KEY in .env
- Verify key at console.groq.com
- Check remaining quota

### "Invalid response format from LLM"
**Cause**: LLM returned non-JSON response
**Solution**: 
- LLM system prompt may need refinement
- Try simpler query
- Check Groq API status

### No results returned
**Cause**: IDs didn't match or discover had no results
**Solution**:
- Check server logs for resolved IDs
- Try different query keywords
- Verify TMDB bearer token is valid

### Empty provider list
**Cause**: `watch_region` not set or invalid
**Solution**:
- orchistration service defaults to 'US'
- User can specify country in query

## Migration from Old System

### For Users
- No action needed
- Old preferences automatically expire
- New interface is self-explanatory

### For Developers
- `/api/tv/discover` endpoint unchanged
- Old PreferencesPage components removed
- Watchlist functionality untouched

## Future Enhancements

1. **Caching Layer**: Redis for frequent queries
2. **Analytics**: Track popular search terms
3. **Confidence Scores**: Show how certain the AI is about parameters
4. **Multi-language**: Support queries in Spanish, French, etc.
5. **Advanced Filters**: "Last 5 years", "Under 50 min episodes"
6. **AI Training**: Fine-tune model on domain-specific data

## Support & Debugging

If the system isn't working:

1. **Check logs**:
   - Server: `npm run start:dev` output
   - Client: Browser DevTools → Console

2. **Verify configuration**:
   ```bash
   curl -X POST http://localhost:3000/api/tv/discover-natural \
     -H "Authorization: Bearer test-token" \
     -H "Content-Type: application/json" \
     -d '{"query": "This is a test query for testing purposes"}'
   ```

3. **Test individual components**:
   - TMDB token: `curl https://api.themoviedb.org/3/genre/tv/list -H "Authorization: Bearer YOUR_TOKEN"`
   - Groq token: Check console.groq.com dashboard

4. **Enable verbose logging**: Add more console.logs to orchestration service

---

## Summary

This refactor transforms your TV recommendation system from a complex multi-step form into an intuitive AI-powered search. The architecture cleanly separates concerns:

- **Client**: Simple UI for natural language input
- **LLM**: Semantic understanding and parameter extraction
- **Orchestration Layer**: Robust ID resolution and validation  
- **TMDB Integration**: Existing discover endpoint remains unchanged

The solution is production-ready with proper error handling, logging, and extensibility.
