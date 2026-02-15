# Saarthi Fund - Free Deployment Guide

## Overview

| Component | Platform | Free Tier |
|-----------|----------|-----------|
| Database | Neon | 512MB storage, 0.25 vCPU |
| Backend | Render | 750 hrs/month |
| Frontend | Vercel | Unlimited static hosting |

---

## Step 1: Database (Neon - Free PostgreSQL)

1. Go to [neon.tech](https://neon.tech) and sign up
2. Create a new project named `saarthi-fund`
3. Copy the connection string (looks like):
   ```
   postgresql://username:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
   ```
4. Run the schema on Neon:
   - Go to "SQL Editor" in Neon dashboard
   - Copy contents of `database/schema.sql` and run it

---

## Step 2: Backend (Render - Free Node.js)

1. Push your code to GitHub (if not already)

2. Go to [render.com](https://render.com) and sign up

3. Click "New" → "Web Service"

4. Connect your GitHub repo

5. Configure the service:
   - **Name**: `saarthi-fund-api`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`

6. Add Environment Variables:
   ```
   DATABASE_URL=<your-neon-connection-string>
   JWT_SECRET=<generate-a-strong-secret-key>
   ALLOWED_ORIGINS=https://your-frontend-url.vercel.app
   PORT=10000
   ```

7. Click "Create Web Service"

8. Note your backend URL (e.g., `https://saarthi-fund-api.onrender.com`)

---

## Step 3: Frontend (Vercel - Free Static Hosting)

1. Update `frontend/src/environments/environment.prod.ts`:
   ```typescript
   export const environment = {
     production: true,
     apiUrl: 'https://saarthi-fund-api.onrender.com/api'  // Your Render URL
   };
   ```

2. Go to [vercel.com](https://vercel.com) and sign up

3. Click "Add New" → "Project"

4. Import your GitHub repo

5. Configure:
   - **Framework Preset**: Angular
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build -- --configuration=production`
   - **Output Directory**: `dist/frontend/browser`

6. Click "Deploy"

7. After deployment, copy your Vercel URL (e.g., `https://saarthi-fund.vercel.app`)

---

## Step 4: Update CORS

Go back to Render and update the `ALLOWED_ORIGINS` environment variable with your Vercel URL:
```
ALLOWED_ORIGINS=https://saarthi-fund.vercel.app
```

---

## Alternative: Railway (All-in-One)

If you prefer a single platform:

1. Go to [railway.app](https://railway.app)
2. Create new project
3. Add PostgreSQL service (free tier: 500MB)
4. Add backend service from GitHub
5. Add frontend service from GitHub
6. Railway auto-detects and configures everything

---

## Environment Variables Reference

### Backend (.env)
```env
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
ALLOWED_ORIGINS=https://your-frontend.vercel.app
PORT=10000
```

### Frontend (environment.prod.ts)
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://your-backend.onrender.com/api'
};
```

---

## Post-Deployment Checklist

- [ ] Database schema created on Neon
- [ ] Backend deployed on Render
- [ ] Frontend deployed on Vercel
- [ ] CORS configured with frontend URL
- [ ] Test login/registration
- [ ] Create admin user via API or database

---

## Creating Admin User

After deployment, create an admin user by running this SQL in Neon:

```sql
INSERT INTO users (id, name, phone, email, password_hash, role, status, joined_at)
VALUES (
  gen_random_uuid(),
  'Admin',
  '9999999999',
  'admin@saarthi.fund',
  '$2a$10$your-bcrypt-hash-here',  -- Generate with bcrypt
  'admin',
  'active',
  CURRENT_DATE
);
```

Or use the registration endpoint and then update role to 'admin' in database.

---

## Troubleshooting

**Backend not starting?**
- Check Render logs
- Verify DATABASE_URL is correct
- Ensure Prisma client is generated in build

**CORS errors?**
- Verify ALLOWED_ORIGINS includes your frontend URL
- Check for trailing slashes

**Database connection failed?**
- Ensure `?sslmode=require` is in connection string
- Check Neon dashboard for connection limits

**Frontend API calls failing?**
- Verify environment.prod.ts has correct backend URL
- Check browser console for errors
