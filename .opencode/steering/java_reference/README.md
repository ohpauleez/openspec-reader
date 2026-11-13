# Java Reference Implementations

This directory contains Java 21 reference implementations used by the Java steering guides:

- [`Result.java`](src/main/java/org/example/util/Result.java) represents expected failures as values.
- [`Box.java`](src/main/java/org/example/util/Box.java) provides lightweight logical tags, typestate, and witnessed capabilities.
- [`BL.java`](src/main/java/org/example/util/BL.java) provides branchless integer and long primitives with explicit overflow handling.

The classes use the neutral example package `org.example.util`. Change that package when adopting the sources in a project.

## Dependencies

The sources retain their Google Error Prone `@CheckReturnValue` annotations. Compilation therefore requires the `com.google.errorprone:error_prone_annotations` dependency. For Maven projects:

```xml
<dependency>
  <groupId>com.google.errorprone</groupId>
  <artifactId>error_prone_annotations</artifactId>
  <version>2.48.0</version>
</dependency>
```

The embedded JML specifications are comments during ordinary Java compilation and can be checked with OpenJML.

## Compilation

With the Error Prone annotations JAR available locally:

```sh
javac --release 21 \
  -cp /path/to/error_prone_annotations-2.48.0.jar \
  -d /tmp/opencode-java-reference \
  src/main/java/org/example/util/*.java
```

## Scope

These files are reference source code rather than a published library. The benchmark observations in the source and steering guides are general implementation guidance; measure representative workloads on the target JVM, hardware, and deployment configuration before selecting a performance-sensitive design.

The sources were relocated from this repository's Java utility examples. Except for the neutral package declaration, their code, comments, annotations, and JML fragments are preserved. They are distributed under the terms in [`LICENSE-APACHE`](LICENSE-APACHE) and [`LICENSE-MIT`](LICENSE-MIT).
