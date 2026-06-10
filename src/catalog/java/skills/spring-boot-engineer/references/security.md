# Securing Endpoints

Spring Security 6 (Boot 3.x). Configuration is the lambda DSL on `SecurityFilterChain`; the old `WebSecurityConfigurerAdapter` is gone.

## Baseline setup

Define a `SecurityFilterChain` bean. Be explicit — `anyRequest().authenticated()` last, deny by default.

```java
@Configuration
@EnableWebSecurity
class SecurityConfig {

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health", "/api/v1/auth/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/orders/**").hasAuthority("SCOPE_orders:read")
                .anyRequest().authenticated())
            .csrf(csrf -> csrf.disable())          // disable only for stateless token APIs
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .oauth2ResourceServer(o -> o.jwt(Customizer.withDefaults()));
        return http.build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
```

- **Do** keep CSRF enabled for browser/session apps; disable it only for stateless token-based APIs.
- **Do** make the chain stateless when using JWTs (no `JSESSIONID`).
- **Don't** use `NoOpPasswordEncoder` or store plaintext passwords. BCrypt/Argon2 only.
- **Don't** rely on ordering of permissive rules being lenient — first match wins, so put specific rules before broad ones.

## Method security

Enable annotation-based authorization for service-layer enforcement (defense in depth alongside URL rules).

```java
@Configuration
@EnableMethodSecurity   // enables @PreAuthorize/@PostAuthorize
class MethodSecurityConfig {}

@Service
class OrderService {

    @PreAuthorize("hasAuthority('SCOPE_orders:write')")
    public Order create(CreateOrderCommand cmd) { ... }

    @PreAuthorize("@ownership.isOwner(#id, authentication)")
    public Order getById(UUID id) { ... }
}
```

- **Do** use SpEL with bean references (`@ownership.isOwner(...)`) for row-level / ownership checks.
- **Do** prefer `@PreAuthorize` over the legacy `@Secured`/`@RolesAllowed` for expressiveness.

## JWT / OAuth2 resource server

For services that validate tokens issued by an IdP (Keycloak, Auth0, Cognito), configure the issuer; Spring fetches the JWKS and validates signatures.

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://idp.example.com/realms/acme
```

Map custom claims to authorities with a converter:

```java
@Bean
JwtAuthenticationConverter jwtAuthConverter() {
    var roles = new JwtGrantedAuthoritiesConverter();
    roles.setAuthoritiesClaimName("roles");
    roles.setAuthorityPrefix("ROLE_");
    var conv = new JwtAuthenticationConverter();
    conv.setJwtGrantedAuthoritiesConverter(roles);
    return conv;
}
```

- **Do** validate `iss`, `aud`, and expiry (Spring does `iss`/expiry by default; add audience validation explicitly).
- **Don't** parse JWTs by hand or trust claims without signature verification.
- **Don't** issue your own tokens unless you must — delegate to a real IdP.

### Issuing tokens yourself

If you genuinely own auth, use a vetted library (`spring-authorization-server` or `nimbus-jose-jwt`). Sign with RS256 (asymmetric) so resource servers verify with the public key. Never hand-roll JWT signing.

## Role / permission model

Distinguish **roles** (coarse, `ROLE_ADMIN`) from **authorities/scopes** (fine, `orders:write`). `hasRole('X')` checks `ROLE_X`; `hasAuthority('X')` checks the literal string.

- **Do** authorize on fine-grained permissions in code; map roles → permissions at the edge.
- **Do** keep the permission catalog in one place; don't scatter magic strings.
- **Don't** hard-code user identity checks in controllers — push to `@PreAuthorize` or a domain check.

## CORS

Configure CORS via the security chain (not only `@CrossOrigin`), and restrict origins explicitly.

```java
http.cors(cors -> cors.configurationSource(corsSource()));
// allow specific origins/methods/headers; never "*" with credentials
```

## Testing security

Use `spring-security-test`. For web slices, set the user; for method security, annotate the test.

```java
@WebMvcTest(OrderController.class)
class OrderControllerSecurityTest {

    @Autowired MockMvc mvc;

    @Test @WithMockUser(authorities = "SCOPE_orders:read")
    void allows_reader() throws Exception {
        mvc.perform(get("/api/v1/orders/1")).andExpect(status().isOk());
    }

    @Test @WithMockUser(authorities = "SCOPE_other")
    void forbids_wrong_scope() throws Exception {
        mvc.perform(get("/api/v1/orders/1")).andExpect(status().isForbidden());
    }

    @Test
    void rejects_anonymous() throws Exception {
        mvc.perform(get("/api/v1/orders/1")).andExpect(status().isUnauthorized());
    }
}
```

For JWT resource servers use the post-processor:

```java
mvc.perform(get("/api/v1/orders/1")
        .with(jwt().authorities(new SimpleGrantedAuthority("SCOPE_orders:read"))));
```

- **Do** test the negative paths (anonymous → 401, wrong authority → 403) — those are the bugs that ship.
- **Do** add `.with(csrf())` to state-changing requests when CSRF is enabled.
- **Don't** disable security in tests to make them pass; that hides the regression you most need to catch.
