# Intent-Based Enterprise Automation Platform

An agentic automation platform featuring a conversational interface (BUILD and RUN modes), MySQL persistence, semantic target resolution, and verified outcome testing.

---

## 1. Where to Set Database URL and Password

Create a file named `.env` in the root folder of this project (you can copy `.env.example`):

```bash
cp .env.example .env
```

Open `.env` and set your `DATABASE_URL` with your MySQL username, password, host, port, and database name:

```env
DATABASE_URL="mysql://<USER>:<PASSWORD>@localhost:3306/<DATABASE_NAME>"
```

### Example:
If your MySQL user is `root`, password is `mysecretpass`, port is `3306`, and database is `automation_agent`:

```env
DATABASE_URL="mysql://root:mysecretpass@localhost:3306/automation_agent"
```

> **Note on Special Characters:** If your password contains special characters (like `@`, `#`, `/`, `%`), URL-encode them (e.g. `@` becomes `%40`, `#` becomes `%23`).

---

## 2. Other Environment Variables in `.env`

You can also specify application credentials:

```env
# Application Port
PORT=3000

# Enterprise Application Credentials (used by browser automation)
CLAIMS_USERNAME="admin@claims-portal.internal"
CLAIMS_PASSWORD="secure_enterprise_password"

# Optional Gemini API key if utilizing cloud LLM features
GEMINI_API_KEY="your-gemini-api-key"
```

---

## 3. Step-by-Step: How to Run on Your Local Machine

### Prerequisites
* **Node.js**: v18+ or v20+ installed.
* **MySQL**: Running locally (or via Docker) with the target database created:
  ```sql
  CREATE DATABASE IF NOT EXISTS automation_agent;
  ```

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Push Prisma Schema to MySQL
This creates all tables (`applications`, `semantic_capabilities`, `business_flows`, `flow_nodes`, `flow_edges`, `executions`, `reports`, etc.) in your MySQL database:

```bash
npm run db:push
```

### Step 3: Generate the Prisma Client
```bash
npm run db:generate
```

### Step 4: Start the Local Development Server
```bash
npm run dev
```

The application will start on:
👉 **`http://localhost:3000`**

---

## 4. Running with Docker (Alternative for MySQL)

If you don't have MySQL installed on your system, you can spin up a local container in seconds:

```bash
docker run --name local-mysql -e MYSQL_ROOT_PASSWORD=password -e MYSQL_DATABASE=automation_agent -p 3306:3306 -d mysql:8.0
```

Then your `.env` connection string will simply be:
```env
DATABASE_URL="mysql://root:password@localhost:3306/automation_agent"
```
