# Web Layer

Controllers translate HTTP to/from the service layer. They do not hold business logic, transactions, or persistence concerns. Keep them thin.

## Controllers

Use `@RestController`. Inject collaborators via constructor. Return `ResponseEntity` only when you need to control status/headers beyond the happy path; otherwise return the body and annotate the status.

```java
@RestController
@RequestMapping("/api/v1/orders")
class OrderController {

    private final OrderService orders;

    OrderController(OrderService orders) {
        this.orders = orders;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    OrderResponse create(@Valid @RequestBody CreateOrderRequest req) {
        return OrderResponse.from(orders.create(req.toCommand()));
    }

    @GetMapping("/{id}")
    OrderResponse get(@PathVariable UUID id) {
        return OrderResponse.from(orders.getById(id));
    }
}
```

- **Do** version the API in the path (`/api/v1`).
- **Do** keep one resource per controller.
- **Don't** inject `HttpServletRequest`/`HttpServletResponse` unless you genuinely need low-level access.

## Request/response DTOs

Use Java `record` types. Separate request and response shapes — never reuse the entity. Add Bean Validation constraints on requests.

```java
public record CreateOrderRequest(
        @NotBlank String customerId,
        @NotEmpty @Valid List<LineItem> items) {

    public record LineItem(@NotBlank String sku, @Positive int qty) {}
}

public record OrderResponse(UUID id, String status, Instant createdAt) {
    static OrderResponse from(Order o) {
        return new OrderResponse(o.getId(), o.getStatus().name(), o.getCreatedAt());
    }
}
```

- **Do** put `@Valid` on nested objects and collection elements so constraints cascade.
- **Don't** expose internal IDs or fields the client should not see.

## Validation

`@Valid` triggers Bean Validation and throws `MethodArgumentNotValidException` on failure. For path/param checks use `@Validated` on the class plus constraints on params (`ConstraintViolationException`). Translate both in the advice below.

Common constraints: `@NotNull`, `@NotBlank`, `@Size`, `@Min/@Max`, `@Positive`, `@Email`, `@Pattern`. For cross-field rules write a custom `ConstraintValidator`.

## Content negotiation

JSON is the default with Jackson. Set `produces`/`consumes` explicitly when an endpoint serves multiple types.

```java
@GetMapping(value = "/{id}", produces = {MediaType.APPLICATION_JSON_VALUE, "application/xml"})
```

Configure global Jackson behavior in `application.yml` rather than per-controller:

```yaml
spring:
  jackson:
    default-property-inclusion: non_null
    serialization:
      write-dates-as-timestamps: false
```

## Error handling

Centralize with `@RestControllerAdvice` and return RFC 7807 `ProblemDetail` (built into Spring 6). Map domain exceptions to status codes here, not in controllers.

```java
@RestControllerAdvice
class ApiExceptionHandler {

    @ExceptionHandler(EntityNotFoundException.class)
    ProblemDetail notFound(EntityNotFoundException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail invalid(MethodArgumentNotValidException ex) {
        var pd = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        pd.setTitle("Validation failed");
        pd.setProperty("errors", ex.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(FieldError::getField, FieldError::getDefaultMessage, (a, b) -> a)));
        return pd;
    }
}
```

- **Do** log 5xx with stack traces; log 4xx at debug. Never return stack traces to clients.
- **Don't** return `200` with an error body — use the correct status code.

## Pagination & sorting

Accept Spring Data's `Pageable` directly. Return a stable envelope, not the raw `Page` (its JSON shape is unstable across versions).

```java
@GetMapping
PageResponse<OrderResponse> list(@PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {
    Page<Order> page = orders.find(pageable);
    return PageResponse.of(page.map(OrderResponse::from));
}
```

Cap the page size (`spring.data.web.pageable.max-page-size: 100`) to protect the DB. For large/keyset use cases, prefer cursor pagination over offset.

## File upload

Use `MultipartFile`. Set limits in config and validate content type/size before touching the bytes.

```java
@PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
ImportResult upload(@RequestPart("file") MultipartFile file) {
    if (file.isEmpty()) throw new BadRequestException("empty file");
    return orders.importCsv(file.getInputStream());
}
```

```yaml
spring:
  servlet:
    multipart:
      max-file-size: 10MB
      max-request-size: 10MB
```

- **Do** stream large files; don't load the whole thing into a `byte[]`.
- **Don't** trust the client-supplied filename — sanitize before any filesystem use.

## MockMvc tests

Use `@WebMvcTest` to test the web slice in isolation, mocking the service. Fast, no DB, no full context.

```java
@WebMvcTest(OrderController.class)
class OrderControllerTest {

    @Autowired MockMvc mvc;
    @MockBean OrderService orders;

    @Test
    void rejects_invalid_body() throws Exception {
        mvc.perform(post("/api/v1/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.title").value("Validation failed"));
    }

    @Test
    void returns_201_on_create() throws Exception {
        when(orders.create(any())).thenReturn(sampleOrder());
        mvc.perform(post("/api/v1/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"customerId":"c1","items":[{"sku":"A","qty":2}]}"""))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").exists());
    }
}
```

- **Do** assert status, key JSON fields, and error shape — not the entire body.
- **Do** add `@WithMockUser` (or `csrf()`) when Spring Security is on the classpath, or the slice returns `401/403`.
- **Don't** wire a real service or DB into a `@WebMvcTest`; that defeats the slice. Use `@SpringBootTest` for that (see testing.md).
