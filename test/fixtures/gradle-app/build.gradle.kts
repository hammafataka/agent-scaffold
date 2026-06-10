plugins {
  id("org.springframework.boot") version "3.3.0"
  java
}
java { sourceCompatibility = JavaVersion.VERSION_21 }
dependencies {
  implementation("org.springframework.boot:spring-boot-starter-web")
  implementation("org.springframework.boot:spring-boot-starter-data-jpa")
  implementation("org.flywaydb:flyway-core")
}
