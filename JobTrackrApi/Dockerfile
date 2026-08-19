# syntax=docker/dockerfile:1

FROM eclipse-temurin:25-jdk AS build
WORKDIR /workspace

COPY mvnw pom.xml ./
COPY .mvn .mvn
RUN chmod +x mvnw

COPY src src
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B verify

FROM eclipse-temurin:25-jre AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 jobtrackr \
    && useradd --system --uid 10001 --gid jobtrackr --home-dir /app --shell /usr/sbin/nologin jobtrackr

COPY --from=build --chown=jobtrackr:jobtrackr /workspace/target/jobtrackr_api-0.0.1-SNAPSHOT.jar /app/app.jar

USER jobtrackr

EXPOSE 8080

ENV SPRING_PROFILES_ACTIVE=production \
    SERVER_PORT=8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
    CMD curl -fsS http://127.0.0.1:8080/actuator/health/readiness || exit 1

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
