# AGENTS.md

## Code Formatting

- Indentation: 4 spaces. Max line length: 120 characters.
- Use blank lines to separate logical blocks.
- Use IntelliJ IDEA default code style for Java.

---

## Java Style

- UTF-8 encoding. Descriptive names. Explicit types (no `var`).
- Declare variables `final` wherever possible. Prefer immutability.
- No magic numbers/strings — use constants.
- Validate nullability at boundaries only. No defensive null checks inside internal code.
- Prefer unchecked exceptions; avoid `throws` clauses.
- No comments except: cron expressions, regex patterns, TODOs, given/when/then in tests.
- Use `@Override`. Prefer direct null checks over `Objects.isNull()`/`Objects.nonNull()`.
- Wrap multiple conditions in a named boolean. Prefer early returns; avoid unnecessary `else`.

---

## Lombok

- `@RequiredArgsConstructor` for constructor injection.
- `@Slf4j` for logging.
- `@Builder(setterPrefix = "with")` for complex object creation.
- Avoid `@Data`; prefer `@Getter`/`@Setter`.

---

## Spring Annotations

| Annotation | Usage |
|---|---|
| `@Service` | Business logic |
| `@Repository` | Data access / JPA |
| `@RestController` | Web controllers |
| `@Component` | Generic beans |
| `@Configuration` | Config classes |
| `@Transactional` | Service layer only. `readOnly = true` for queries |
| `@Validated` | Enable Bean Validation |
| `@PreAuthorize` | Controller layer for security |
| `@ConfigurationProperties` | 3+ related properties (avoid multiple `@Value`) |

- Prefer constructor injection. Field injection only in tests.
- No circular dependencies. Avoid `@Order` for dependency resolution.

---

## Mappers

**MapStruct** (default):

```java
@Mapper(componentModel = "spring")
public interface UserMapper {
    @Mapping(source = "email", target = "emailAddress")
    UserDTO toDto(User user);
    @Mapping(source = "emailAddress", target = "email")
    User toEntity(UserDTO dto);
}
```

**Static Mapper** (only if explicitly requested):

```java
public class UserMapper {
    private UserMapper() { throw new UnsupportedOperationException("This class should never be instantiated"); }
    public static UserDTO toDto(final User user) { ... }
    public static User toEntity(final UserDTO dto) { ... }
}
```

---

## Exception Handling

- Custom exceptions extend `RuntimeException`.
- Global handler via `@ControllerAdvice` + `@ExceptionHandler`.
- Consistent error response structure. Map to appropriate HTTP status codes.

---

## Testing

- JUnit 5 + Mockito. `@WebMvcTest` for controllers. `@SpringBootTest` for integration.
- `given/when/then` structure. snake_case or camelCase method names.
- No reflection. No business logic in tests — verify behavior only.

---

## Logging

```java
log.info("[Service/Module] - ACTION: response: {}, userId: {}", body, userId);
log.error("[Service/Module] - ACTION: errorMessage: {}, userId: {}", errorMessage, userId);
```

- Levels: `DEBUG`, `INFO`, `WARN`, `ERROR`. No sensitive data. Use `{}` placeholders.

---

## Running the Application

> **This is a Spring Boot project. Always run it as described below — never use `java -jar` unless told otherwise.**

### Prerequisites

All secrets live in `.env` at the project root. Load it before every command:

```bash
export $(grep -v '^#' .env | xargs)
```

If `.env` is missing, stop and ask the user to provide it.

Make the Maven wrapper executable if needed (one-time):

```bash
chmod +x mvnw
```

### Start

```bash
export $(grep -v '^#' .env | xargs) && ./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

- Always use `./mvnw`, never bare `mvn`.
- Always pass `-Dspring-boot.run.profiles=local` (or `dev`/`test` when context requires).

### Rebuild & Start (after code changes)

```bash
export $(grep -v '^#' .env | xargs) && ./mvnw clean spring-boot:run -DskipTests -Dspring-boot.run.profiles=local
```

### Run Tests

```bash
# All tests
./mvnw test

# Specific class
./mvnw test -Dtest=ClassName

# With profile (integration tests)
export $(grep -v '^#' .env | xargs) && ./mvnw test -Dspring.profiles.active=test
```

### Verify Running

```bash
curl -s http://localhost:8080/actuator/health
# Expected: {"status":"UP"}
```

### Stop

`CTRL+C` in the terminal. If backgrounded:

```bash
lsof -i :8080   # find PID
kill -9 <PID>
```

### Infrastructure (Docker Compose)

Start DB and other dependencies before the app. Never run the Spring Boot app itself in Docker during local dev.

```bash
docker-compose up -d    # start infra
docker-compose down     # stop infra
```

### Troubleshooting

| Symptom | Fix |
|---|---|
| Missing properties / app fails to start | Load `.env` and set `-Dspring-boot.run.profiles=local` |
| `Port 8080 already in use` | `lsof -i :8080` → `kill -9 <PID>` |
| `./mvnw: Permission denied` | `chmod +x mvnw` |
| `Could not find main class` | `./mvnw clean` then retry |
| DB connection refused | Start Docker Compose; verify `DB_URL` in `.env` |
