# Trade Tracking System

A microservices-based trade tracking application with a React frontend and Node.js backend.

## Setup (Development)

1. Install dependencies:

   ```bash
   cd backend && npm install
   cd ../frontend && npm install

   ```

2. Start infrastructure services (Kafka, Jaeger, Prometheus):

```bash
  docker-compose up --build
```

3. In a separate terminal, start the backend locally:

```bash
  cd backend && npm start
```

4. In another terminal, start the frontend locally:

```bash
cd frontend && npm run dev
```

5. Access `frontend` at http://localhost:3000

6. Access `Jaeger` at http://localhost:16686

7. Access `Prometheus` at http://localhost:9090

# Deployment

1. Ensure .env files are set up:

- `backend/.env:` Set `JWT_SECRET` and other variables.
- `frontend/.env:` Ensure `VITE_API_URL=http://backend:5000`.

2. Deploy the full stack:

```bash
docker-compose -f docker-compose.prod.yml up --build
```

3. Access the application:

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Jaeger: http://localhost:16686
- Prometheus: http://localhost:9090

4. Stop the deployment

```bash
docker-compose -f docker-compose.prod.yml down
```

# Backend

- Run server: `npm start`
- Run consumer: `npm run consumer` (optional, if separate)
- Generate Prisma client: `npx prisma generate`
- Migrate database: `npx prisma migrate dev`

# Frontend

- Run dev server: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`

# Notes

- For `development`, changes are reflected immediately when running locally.
- For `deployment`, use `docker-compose.prod.yml` to run the full stack in containers.

---

### Notes
- **Development**: Use `docker-compose.yml` for infrastructure (Kafka, Jaeger, Prometheus) and run `backend` and `frontend` locally with `npm start` and `npm run dev`.
- **Deployment**: Use `docker-compose.prod.yml` to run the entire stack (including backend and frontend) in Docker containers.
- **Environment Variables**: Ensure `backend/.env` has a secure `JWT_SECRET` for deployment. The `.env` files provided are for development; adjust them for production as needed.
- **Database**: Currently uses SQLite (`dev.db`). For a production deployment, consider adding a PostgreSQL service to `docker-compose.prod.yml`.
- **Kafka Consumer**: Runs within `index.ts` for simplicity. If you want it separate in production, adjust `index.ts` and add a `backend-consumer` service to `docker-compose.prod.yml`.