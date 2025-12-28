# Dockerfile
# USAR DEBIAN (SLIM) EN LUGAR DE ALPINE PARA EVITAR ERRORES SILENCIOSOS
FROM node:22-slim

# Instalar herramientas básicas que a veces faltan
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Usamos node directo para asegurar que las señales de sistema pasen bien
CMD ["node", "index.js"]