# Single image: Vite-built frontend served as static files by the Spring Boot backend.

# 1) Frontend
FROM node:24-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2) Backend (+ bundled frontend)
FROM eclipse-temurin:21-jdk AS backend
WORKDIR /app
COPY backend/.mvn .mvn
COPY backend/mvnw backend/pom.xml ./
RUN ./mvnw -B -q dependency:go-offline
COPY backend/src src
COPY --from=frontend /app/dist src/main/resources/static
RUN ./mvnw -B -q package

# 3) Runtime
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=backend /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
