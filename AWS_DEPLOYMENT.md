# AWS Ubuntu Deployment Guide for SolarCRM

This document provides a step-by-step guide on how to deploy SolarCRM onto a public AWS EC2 instance running Ubuntu 22.04 LTS. It leverages Docker Compose for container orchestration (Nginx, Node.js backend, and PostgreSQL).

---

## Prerequisites
- An active AWS Account.
- Cloudflare R2 bucket details (or similar S3-compatible storage) for file uploads.
- Git repository access (to clone the project on the server).

---

## Step 1: Launch an AWS EC2 Instance

1. Log in to the **AWS Management Console** and navigate to **EC2**.
2. Click **Launch Instance**.
3. **Name**: Enter `SolarCRM-Production` or a name of your choice.
4. **Application and OS Image (AMI)**:
   - Select **Ubuntu**.
   - Choose **Ubuntu Server 22.04 LTS (HVM), SSD Volume Type** (64-bit x86).
5. **Instance Type**:
   - Choose at least **t3.small** (2 vCPUs, 2 GB RAM) or **t3.medium** (2 vCPUs, 4 GB RAM) for smooth frontend building and database performance.
6. **Key Pair**:
   - Select or create a key pair (e.g., `solarcrm-key.pem`). Download and save it securely.
7. **Configure Storage**:
   - Set size to at least **20 GiB** (gp3 SSD recommended) to accommodate PostgreSQL data and Docker builds.

---

## Step 2: Configure AWS Security Group

A security group acts as a virtual firewall. In the **Network settings** section of the EC2 launch dashboard, configure the following inbound rules:

| Protocol | Port Range | Source | Description |
| :--- | :--- | :--- | :--- |
| **SSH** (TCP) | `22` (or your custom SSH port) | `My IP` (Recommended) or `0.0.0.0/0` | Access server shell |
| **HTTP** (TCP) | `80` | `0.0.0.0/0` | Public web access |
| **HTTPS** (TCP) | `443` | `0.0.0.0/0` | Secure public web access |
| **Custom TCP** | `8080` (Optional) | `0.0.0.0/0` | Plaintext fallback port (if not using port 80 mapping) |

*Click **Launch Instance** to finalize creation.*

---

## Step 3: Allocate and Associate an Elastic IP (Public IP)

By default, an EC2 instance's public IP address changes whenever the instance is stopped and restarted. To prevent this, allocate a static public IP (Elastic IP):

1. Under the EC2 Sidebar, click **Network & Security** → **Elastic IPs**.
2. Click **Allocate Elastic IP address**. Select your region and click **Allocate**.
3. Select the newly created Elastic IP, click **Actions** → **Associate Elastic IP address**.
4. Select your **Instance** and click **Associate**.
5. Note down this public IP (e.g., `54.210.xx.xx`).

---

## Step 4: Connect to your Instance via SSH

Open your terminal (macOS/Linux) or PowerShell (Windows) and connect to the instance:

```bash
# Adjust the permissions on your private key
chmod 400 /path/to/solarcrm-key.pem

# SSH into the Ubuntu machine
ssh -i /path/to/solarcrm-key.pem ubuntu@<YOUR_ELASTIC_IP>
```

---

## Step 5: Clone the Repository & Initialize Files

Once connected to your Ubuntu instance:

1. Clone the project code to your server (we recommend putting it in `/opt/solarcrm` or under your home directory):
   ```bash
   sudo git clone https://github.com/<your-username>/<your-repo-name>.git /opt/solarcrm
   ```
2. Navigate to the project directory and change folder ownership to allow writing files:
   ```bash
   cd /opt/solarcrm
   sudo chown -R ubuntu:ubuntu /opt/solarcrm
   ```

---

## Step 6: Configure Environment Variables

Create and configure the production environment variables inside the `infrastructure/` directory.

1. Generate the `.env` file from the production template:
   ```bash
   cp infrastructure/.env.example infrastructure/.env
   ```
2. Edit the `.env` file using `nano` or another editor:
   ```bash
   nano infrastructure/.env
   ```
3. Update the following key configuration parameters:
   ```env
   # Set DOMAIN to your domain (or public IP if you don't have a domain yet)
   DOMAIN=54.210.xx.xx
   
   # Set the URL where users will access the site
   APP_URL=http://54.210.xx.xx
   
   # Change database credentials to secure values
   POSTGRES_DB=solarcrm
   POSTGRES_USER=solarcrm_app
   POSTGRES_PASSWORD=your_super_secure_random_db_password
   
   # Update JWT Secret to a long secure random string
   JWT_SECRET=generate-a-secure-64-character-string-here
   
   # Provide your Cloudflare R2 Credentials
   R2_ACCOUNT_ID="your-r2-account-id"
   R2_ACCESS_KEY_ID="your-r2-access-key-id"
   R2_SECRET_ACCESS_KEY="your-r2-secret-access-key"
   R2_BUCKET_NAME="solarcrm-files"
   R2_PUBLIC_URL="https://your-public-bucket-url.r2.dev"
   R2_ENDPOINT="https://your-r2-account-id.r2.cloudflarestorage.com"
   ```
4. Save the file (`Ctrl+O` then `Enter`) and exit nano (`Ctrl+X`).

---

## Step 7: Run the Setup Script

The automated setup script will install Docker, configure firewall policies, verify your `.env` variables, prompt you to map HTTP traffic to port `80:80` inside `docker-compose.yml`, and spin up the production environment.

1. Make the script executable:
   ```bash
   chmod +x setup_aws.sh
   ```
2. Run the script:
   ```bash
   sudo ./setup_aws.sh
   ```
3. Follow the interactive prompts:
   - **Docker Install**: Select `y` to configure system libraries, setup Docker, and allocate swap space if it is a fresh instance.
   - **Environment Confirmation**: Confirm `y` once your environment file (`infrastructure/.env`) is configured.
   - **Port Mapping**: Select `y` to automatically update the Nginx port mapping inside `docker-compose.yml` from `8080:80` to `80:80` so the site is served directly on standard HTTP.

The script will now proceed to compile the React/Vite frontend files, build the Express/TypeScript API container, and run PostgreSQL internally.

---

## Step 8: Verify Deployment

Check that all containers are healthy:
```bash
docker compose -f infrastructure/docker-compose.yml ps
```

You should see:
- `solarcrm-nginx` - Up (healthy) on port `0.0.0.0:80->80/tcp` (or `8080->80/tcp`)
- `solarcrm-backend` - Up (healthy) on internal port `4000`
- `solarcrm-postgres` - Up (healthy) on internal port `5432`
- `solarcrm-monitor` - Up on internal port `3001`

Open your browser and navigate to `http://<YOUR_PUBLIC_IP>`.

**Default Login Credentials:**
- **Email**: `admin@solarcrm.local`
- **Password**: `admin12345`
*(Please change these immediately under User Settings after logging in!)*

---

## Step 9: Configure Domain and SSL (Recommended)

To secure traffic to your public server, you should configure domain name resolution and SSL/HTTPS.

### Option A: Cloudflare Tunnel / SSL (Recommended)
If using Cloudflare:
1. Add an `A` record in Cloudflare pointing to your AWS public Elastic IP.
2. In the Cloudflare Dashboard, set SSL/TLS mode to **Flexible** (SSL terminated at Cloudflare) or **Full (Strict)**.
3. If using **Full (Strict)**:
   - Generate an Origin Certificate inside Cloudflare.
   - Save the certificate content as `/opt/solarcrm/infrastructure/nginx/ssl/origin.pem`.
   - Save the private key content as `/opt/solarcrm/infrastructure/nginx/ssl/origin-key.pem`.
   - Update `infrastructure/nginx/conf.d/default.conf` to reflect your domain name in the SSL server block.
   - Reload Nginx: `docker exec solarcrm-nginx nginx -s reload`.

### Option B: Let's Encrypt / Certbot on Host
If you want to manage SSL certificates directly on the AWS instance:
1. Point your domain DNS record directly to the AWS Elastic IP.
2. Install Certbot on the host machine:
   ```bash
   sudo apt update
   sudo apt install -y certbot
   ```
3. Temporarily stop the docker-compose Nginx container to free up port 80:
   ```bash
   docker compose -f /opt/solarcrm/infrastructure/docker-compose.yml stop nginx
   ```
4. Request the certificate:
   ```bash
   sudo certbot certonly --standalone -d crm.yourdomain.com
   ```
5. Map the generated Let's Encrypt directories into the Nginx container by editing `infrastructure/docker-compose.yml` to mount the cert files:
   ```yaml
   volumes:
     - /etc/letsencrypt/live/crm.yourdomain.com/fullchain.pem:/etc/nginx/ssl/origin.pem:ro
     - /etc/letsencrypt/live/crm.yourdomain.com/privkey.pem:/etc/nginx/ssl/origin-key.pem:ro
   ```
6. Start Nginx:
   ```bash
   docker compose -f /opt/solarcrm/infrastructure/docker-compose.yml start nginx
   ```

---

## Monitoring and Logs

- **Logs**: To watch logs live, run:
  ```bash
  docker compose -f /opt/solarcrm/infrastructure/docker-compose.yml logs -f
  ```
- **Backend logs specifically**:
  ```bash
  docker compose -f /opt/solarcrm/infrastructure/docker-compose.yml logs -f backend
  ```
- **Monitoring Dashboard**:
  Uptime Kuma is available internally at port 3001. If you configure custom routes or proxy it via Nginx, you can access the dashboard at `http://<YOUR_DOMAIN>/status/` or `http://<YOUR_PUBLIC_IP>:3001` (if port 3001 is opened temporarily in security groups).
