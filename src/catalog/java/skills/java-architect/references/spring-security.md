# Spring Security

Spring Security is a chain of servlet filters that run before your controllers.
Understanding the chain is the key to configuring it correctly.

## The filter chain

A request passes through an ordered `SecurityFilterChain`. Key filters:

- `SecurityContextHolderFilter` — loads any existing authentication.
- Authentication filters — `UsernamePasswordAuthenticationFilter`,
  `BearerTokenAuthenticationFilter` (resource server), etc.
- `AuthorizationFilter` — enforces access rules (replaces the old
  `FilterSecurityInterceptor`).
- `ExceptionTranslationFilter` — turns `AccessDeniedException` /
  `AuthenticationException` into 403/401.

Authentication produces an `Authentication` stored in the `SecurityContext`
(ThreadLocal). Authorization decisions read its authorities.

## Configuration (Boot 3 / Security 6 style)

Component-based config, lambda DSL, no `WebSecurityConfigurerAdapter`:

```java
@Configuration
@EnableWebSecurity
class SecurityConfig {

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/public/**").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated())
            .oauth2ResourceServer(oauth -> oauth.jwt(Customizer.withDefaults()))
            .csrf(csrf -> csrf.disable())               // see CSRF section
            .sessionManagement(s -> s.sessionCreationPolicy(STATELESS))
            .build();
    }
}
```

You can register **multiple** `SecurityFilterChain` beans with
`securityMatcher(...)` and `@Order` — e.g., a stateless JWT chain for `/api/**`
and a separate chain for an admin UI.

## Authentication (authn) vs authorization (authz)

- **Authn** — who are you? `UserDetailsService` (form/basic), or a JWT/OAuth2
  token. Passwords: always a `PasswordEncoder` (`BCryptPasswordEncoder` or
  Argon2). Never store or compare plaintext.
- **Authz** — what may you do? URL rules in `authorizeHttpRequests`, or method
  security. Use `hasRole` (adds `ROLE_` prefix) vs `hasAuthority` (exact)
  deliberately.

## Method security

Enable annotation-based checks for service-layer enforcement:

```java
@EnableMethodSecurity
class MethodSecurityConfig {}

@Service
class AccountService {
    @PreAuthorize("hasRole('ADMIN') or #ownerId == authentication.name")
    public Account get(String ownerId) { ... }

    @PostAuthorize("returnObject.owner == authentication.name")
    public Document load(Long id) { ... }
}
```

Defense in depth: URL rules guard the edge; method security guards the service
even if a new controller forgets a rule.

## JWT / OAuth2 resource server

For stateless APIs, validate tokens minted by an external issuer (Keycloak,
Auth0, Cognito). You do not write the auth server.

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://issuer.example.com/   # discovers JWKS for sig verification
```

Map token claims (e.g., `realm_access.roles`) to authorities with a
`JwtAuthenticationConverter` / `Converter<Jwt, Collection<GrantedAuthority>>`.
Access the principal via `@AuthenticationPrincipal Jwt jwt`.

## CORS and CSRF

- **CSRF** protects cookie/session-authenticated browser requests. For a
  **stateless token API** (Authorization header, no session cookie), disabling
  CSRF is correct. If you use cookie auth for a browser app, keep CSRF on
  (`CookieCsrfTokenRepository.withHttpOnlyFalse()`).
- **CORS** is required when a browser app on another origin calls the API.
  Configure it in Security, not just MVC, so it runs before auth:

```java
http.cors(cors -> cors.configurationSource(corsSource()));
```

Set explicit allowed origins/methods/headers — never reflect `*` together with
credentials.

## Testing security

`spring-security-test` provides request post-processors and annotations.

```java
@WebMvcTest(AccountController.class)
class AccountControllerTest {
    @Autowired MockMvc mvc;

    @Test
    @WithMockUser(roles = "ADMIN")
    void adminCanList() throws Exception {
        mvc.perform(get("/api/admin/accounts")).andExpect(status().isOk());
    }

    @Test
    void anonymousIsUnauthorized() throws Exception {
        mvc.perform(get("/api/admin/accounts")).andExpect(status().isUnauthorized());
    }
}
```

- For JWT: `mvc.perform(get("/api/x").with(jwt().authorities(...)))`.
- For OAuth2 login: `.with(oidcLogin())`.
- Test both the allow and the deny path for each protected route — missing deny
  tests are how access-control bugs ship.

## Checklist

- [ ] Stateless APIs: `SessionCreationPolicy.STATELESS`, CSRF disabled, bearer
      tokens.
- [ ] `anyRequest().authenticated()` as the catch-all (deny by default).
- [ ] Passwords hashed with a strong `PasswordEncoder`.
- [ ] Token claims mapped to authorities; principal injected, not parsed by hand.
- [ ] Method security on sensitive service methods (defense in depth).
- [ ] CORS configured with explicit origins; no `*` + credentials.
- [ ] Tests cover allow and deny for each protected endpoint.

## Do / Don't

- **Do** keep auth rules in one reviewed place; prefer deny-by-default.
- **Don't** disable CSRF reflexively on cookie-based browser apps.
- **Don't** roll your own JWT parsing/validation — use the resource server.
- **Don't** put secrets or role logic in the frontend; the API is the boundary.
