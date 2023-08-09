# Utilisez une image de node.js en tant que base
FROM node:12.5.0

# Créez un répertoire de travail dans le conteneur
WORKDIR /app

# Copiez les fichiers package.json et package-lock.json vers le répertoire de travail
COPY package*.json ./

# Installez les dépendances de l'application
RUN npm install

# Copiez tous les fichiers de votre application vers le répertoire de travail
COPY . .

# Exposez le port sur lequel votre application écoute
EXPOSE 3000

# Commande pour démarrer l'application
CMD [ "npm", "start" ]
