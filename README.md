# Inventory Backend

Backend de inventario con NestJS, Prisma y PostgreSQL. Esta guía permite preparar el proyecto desde cero, arrancarlo de dos formas, consultar su documentación OpenAPI y comprobar la conexión a la base de datos.

## Inicio rápido

1. Clona el repositorio y abre una terminal en su carpeta raíz, donde están `package.json` y `compose.yaml`.
2. Instala Node.js, Git y Docker con Compose si aún no los tienes. Abre Docker Desktop o inicia tu motor de Docker.
3. Crea tu archivo local de variables e instala las dependencias:

   ```bash
   cp .env.example .env
   npm ci
   ```

   En PowerShell, usa `Copy-Item .env.example .env` en lugar de `cp`. Si ya tienes un `.env`, consérvalo y no repitas la copia.

4. Arranca la base de datos y la aplicación:

   ```bash
   docker compose up -d --build --wait
   ```

5. Abre <http://localhost:3000/>. Debes ver `Hello World!`. La documentación de la API está en <http://localhost:3000/api>. Consulta el estado con `docker compose ps`: tanto `app` como `db` deben aparecer como `healthy`.

Cuando termines, ejecuta `docker compose down`. Esto detiene los contenedores sin borrar el volumen de datos.

## 1. Componentes del proyecto

| Componente         | Para qué sirve                                                            |
| ------------------ | ------------------------------------------------------------------------- |
| NestJS             | Aplicación en `src/` con módulo, controlador y servicio iniciales.        |
| Prisma             | Esquema, configuración, cliente generado y servicio integrado con NestJS. |
| OpenAPI            | Documentación interactiva y especificación `openapi.yml` generada.        |
| PostgreSQL         | Servicio `db` de Compose, con PostgreSQL 16.                              |
| App + db en Docker | `Dockerfile` para NestJS y `compose.yaml` con ambos servicios.            |
| Linting            | Oxlint, ejecutado mediante `npm run lint`.                                |
| Husky              | Hooks de Git instalados mediante el script `prepare`.                     |
| Commitlint         | Validación del mensaje del commit con Conventional Commits.               |

El proyecto ofrece la infraestructura inicial. Aún no hay modelos de inventario ni tablas de negocio en PostgreSQL.

## 2. Requisitos para trabajar

- Git, para clonar el repositorio y utilizar los hooks.
- Node.js y npm, para desarrollar fuera del contenedor. La versión del proyecto está fijada en `.nvmrc` (`22.23.3`).
- Docker con Compose. En macOS puedes utilizar Docker Desktop y mantener su motor ejecutándose.
- Puertos `3000` y `5432` disponibles en tu computadora.

Comprueba las herramientas antes de continuar:

```bash
node --version
npm --version
docker compose version
docker info
```

Si `docker info` no puede conectar, inicia Docker Desktop o el motor de Docker y vuelve a intentarlo.

En esta configuración se usa `docker compose`, con espacio. La consigna lo llama `docker-compose`; el archivo de configuración es `compose.yaml`.

## 3. Preparar el entorno después de clonar

Ejecuta los comandos desde la raíz del repositorio:

```bash
cp .env.example .env
npm ci
```

Copia `.env.example` solamente si todavía no tienes tu `.env`. No sobrescribas una configuración local existente. En PowerShell, el comando de copia es `Copy-Item .env.example .env`.

`npm ci` instala las versiones resueltas en `package-lock.json`. Al finalizar, npm ejecuta:

- `postinstall`: genera el cliente de Prisma.
- `prepare`: activa Husky en este repositorio.

Si trabajas exclusivamente con los contenedores, Docker instala las dependencias de la app durante la construcción. Para que los hooks funcionen al hacer commits desde tu computadora, necesitas también las dependencias locales y la ejecución de `prepare`.

### Variables de entorno

El archivo de ejemplo contiene:

```dotenv
POSTGRES_USER=inventory
POSTGRES_PASSWORD=inventory_dev
POSTGRES_DB=inventory
DATABASE_URL=postgresql://inventory:inventory_dev@localhost:5432/inventory?schema=public
PORT=3000
```

| Variable            | Para qué sirve                                               |
| ------------------- | ------------------------------------------------------------ |
| `POSTGRES_USER`     | Usuario que PostgreSQL crea al inicializar un volumen vacío. |
| `POSTGRES_PASSWORD` | Contraseña de ese usuario.                                   |
| `POSTGRES_DB`       | Base de datos inicial.                                       |
| `DATABASE_URL`      | Dirección de conexión de Prisma al trabajar localmente.      |
| `PORT`              | Puerto de NestJS al trabajar localmente.                     |

Son valores de ejemplo para desarrollo. Cada integrante puede usar los mismos: tendrá una base de datos independiente en su computadora.

`.env` se excluye de Git. `.env.example` sí se comparte en el repositorio.

Para mantener la configuración sencilla, utiliza los valores del ejemplo. Si los cambias, actualiza también `DATABASE_URL`. Los caracteres especiales de las credenciales requieren codificación adecuada en una URL; Compose construye su URL directamente con las variables `POSTGRES_*`.

## 4. Cómo levantar todo en Docker

Abre Docker Desktop o inicia tu motor de Docker y ejecuta:

```bash
docker compose up --build
```

El comando construye la imagen de NestJS y levanta ambos servicios. Los logs permanecen en esa terminal.

Para dejarlos en segundo plano y esperar a que estén sanos:

```bash
docker compose up -d --build --wait
```

Para arranques posteriores, si no cambiaste el código ni las dependencias:

```bash
docker compose up
```

La conexión dentro de Docker es:

```text
Navegador → localhost:3000 → app (NestJS + Prisma) → db:5432 (PostgreSQL)
```

Abre `http://localhost:3000/`. El endpoint inicial responde `Hello World!`.

### Cómo está configurado Docker Compose

**Servicio `db`:**

- Usa la imagen `postgres:16`.
- Lee las credenciales de `.env` mediante la interpolación de Compose.
- Publica PostgreSQL en el puerto `5432` de tu computadora.
- Guarda los datos en el volumen `postgres_data`, montado en `/var/lib/postgresql/data`.
- Su `healthcheck` ejecuta `pg_isready`.

**Servicio `app`:**

- Construye la imagen usando el `Dockerfile` del proyecto.
- Publica NestJS en el puerto `3000`.
- Recibe `PORT=3000` y una `DATABASE_URL` construida con las credenciales de PostgreSQL y el host `db`.
- Espera a que `db` esté sano mediante `depends_on` y `condition: service_healthy`.
- Su `healthcheck` comprueba que el endpoint inicial responda correctamente por HTTP.

Dentro del contenedor, `localhost` corresponde al propio contenedor. Por eso la app utiliza `db`, el nombre del servicio de PostgreSQL. Las variables inyectadas por Compose tienen prioridad frente a la carga de `.env` mediante dotenv.

### Cómo está configurado el Dockerfile

1. Parte de `node:22-bookworm-slim`.
2. Instala OpenSSL para las herramientas de Prisma.
3. Trabaja en `/app`.
4. Define `HUSKY=0` para omitir la instalación de hooks dentro del contenedor.
5. Copia los archivos de dependencias y la configuración de Prisma.
6. Ejecuta `npm ci`, que también genera el cliente de Prisma.
7. Copia el resto del proyecto y ejecuta `npm run build`.
8. Arranca con `npm run start:dev`.

`.dockerignore` evita copiar dependencias locales, archivos compilados, Git, hooks y el `.env` a la imagen.

La configuración actual no monta tu código local dentro del contenedor. Si cambias archivos en tu computadora, utiliza `docker compose up --build` para incorporar esos cambios a la imagen. Para trabajar con recarga automática de tus archivos locales, utiliza el modo siguiente.

## 5. Cómo desarrollar con NestJS local y PostgreSQL en Docker

Si la app de Docker está ejecutándose, detén solo esa app para liberar el puerto `3000`:

```bash
docker compose stop app
```

Después:

```bash
docker compose up -d --wait db
npm run start:dev
```

En este modo, la conexión es:

```text
NestJS + Prisma en tu computadora → localhost:5432 → PostgreSQL en Docker
```

`prestart:dev` genera el cliente de Prisma antes de arrancar. `start:dev` ejecuta `nest start --watch`, que recompila y reinicia la app cuando cambias el código.

Para detener NestJS local, presiona `Ctrl+C` en su terminal.

Para volver a ejecutar la app dentro de Docker, primero detén NestJS local y después ejecuta `docker compose up -d --build --wait`.

## 6. Cómo se integró Prisma con NestJS

El proyecto utiliza Prisma, su cliente y el adaptador PostgreSQL en la versión `7.10.0`, junto con `pg` y `dotenv`.

### Archivos de Prisma

- `prisma/schema.prisma`: declara el proveedor `postgresql` y el generador `prisma-client`, con formato ESM. El cliente se genera en `src/generated/prisma`.
- `prisma.config.ts`: carga `.env`, indica la ubicación del esquema y obtiene la conexión desde `DATABASE_URL` para las herramientas de Prisma.
- `src/generated/prisma`: código generado automáticamente; no se guarda en Git.

El esquema no tiene modelos todavía. Generar el cliente no crea tablas ni modifica los datos.

### Archivos de integración con NestJS

- `src/prisma/prisma.service.ts`: carga las variables, exige `DATABASE_URL` y crea Prisma con el adaptador `PrismaPg`.
- `src/prisma/prisma.module.ts`: registra y exporta el servicio para que otros módulos puedan utilizarlo.
- `src/app.module.ts`: importa `PrismaModule` para integrarlo en la aplicación.
- `src/main.ts`: permite escuchar conexiones en `0.0.0.0` y activa los hooks de cierre de NestJS.

Al iniciar la app, `PrismaService` abre la conexión y ejecuta `SELECT 1`. Si funciona, muestra:

```text
Conexion con PostgreSQL verificada
```

Si falla, la app no completa su arranque. Al cerrar la aplicación mediante su ciclo de vida, el servicio desconecta Prisma.

Puedes regenerar el cliente manualmente con:

```bash
npm run prisma:generate
```

También se genera automáticamente después de instalar dependencias, antes de compilar y antes de `start:dev`.

## 7. Documentación OpenAPI

Con la aplicación encendida, abre <http://localhost:3000/api> para ver y probar los endpoints en Swagger UI. El documento JSON está en <http://localhost:3000/api-json>. Actualmente describe el endpoint inicial `GET /`; al agregar endpoints se incluirán en el documento generado por NestJS.

Para generar el archivo YAML que se adjuntará a un release:

```bash
npm run openapi:generate
```

El comando compila la aplicación y escribe `openapi.yml` en la raíz. No necesita una base de datos en ejecución: crea el documento sin arrancar el servidor ni abrir una conexión. El archivo se genera automáticamente en CI y al publicar un release, por lo que está excluido de Git.

`src/openapi.config.ts` concentra el título y la versión del documento. Si defines `APP_VERSION`, esa versión aparecerá en el YAML; el workflow de release la obtiene del tag `vX.Y.Z`.

## 8. Linting, Husky y Commitlint

### Linting: revisar el código

Oxlint revisa `src/` y `test/` y excluye el cliente generado por Prisma:

```bash
npm run lint
```

Linting revisa problemas en el código. Prettier se utiliza para el formato.

### Husky: ejecutar controles durante los commits

El script `prepare` ejecuta `husky` para configurar los hooks locales. Puedes activarlos nuevamente con:

```bash
npm run prepare
```

- `.husky/pre-commit` ejecuta `npm test`. Si falla una prueba, el commit se detiene.
- `.husky/commit-msg` valida el prefijo con el script del proyecto y después ejecuta Commitlint. El mensaje debe usar uno de estos tipos: `feat`, `fix`, `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf` o `test`.

Los controles se ejecutan en la computadora donde se hace el commit; no dentro de PostgreSQL ni de la app en Docker.

### Commitlint: revisar el mensaje del commit

`commitlint.config.cjs` extiende `@commitlint/config-conventional`.

El formato básico es:

```text
tipo: descripción
```

También admite un alcance:

```text
tipo(alcance): descripción
```

Ejemplos:

```text
chore: configure backend infrastructure
feat(products): add product endpoint
fix: correct database connection
```

Un mensaje como `cambios` se rechaza porque no tiene la estructura requerida. No es obligatorio incluir número de issue o ticket, ni se modifica el mensaje automáticamente.

Después de preparar tus archivos con `git add`, puedes crear un commit así:

```bash
git commit -m "chore: configurar infraestructura del backend"
```

Husky ejecutará las pruebas antes del commit; luego el script de prefijos y Commitlint validarán el mensaje.

## 9. CI y releases en GitHub

El workflow `.github/workflows/on_pr.yml` se ejecuta cuando se abre o actualiza un pull request hacia `main`, y cuando hay un push a `main`. Instala dependencias y ejecuta lint, pruebas unitarias, compilación y generación de OpenAPI. Usa la versión de Node definida en `.nvmrc`.

El workflow `.github/workflows/release.yml` se ejecuta al publicar un tag que coincida con `v*.*.*`, por ejemplo `v1.0.0`. Genera notas a partir de los commits mediante `scripts/changelog.sh`, genera `openapi.yml` con la versión del tag y crea un GitHub Release con ambos elementos. Si falla la generación de OpenAPI, el release se detiene.

## 10. Cómo verificar la configuración

### Compilación y pruebas locales

```bash
npm run lint
npm run build
npm test
npm run openapi:generate
```

La prueba de integración necesita PostgreSQL disponible y `DATABASE_URL` configurada:

```bash
docker compose up -d --wait db
npm run test:e2e
```

### Contenedores y conexión

```bash
docker compose ps
docker compose logs app
docker compose logs db
curl http://localhost:3000/
```

Ambos servicios deben aparecer como `healthy`. Los logs de la app deben mostrar la confirmación de la conexión, y la solicitud HTTP debe responder `Hello World!`.

### Ejecutar consultas en PostgreSQL

Para probar una consulta sin entrar a la consola interactiva, ejecuta desde la raíz del proyecto:

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1 AS ok;"'
```

Debe aparecer una fila con el valor `1`. El contenedor debe estar encendido; si no lo está, inicia primero `docker compose up -d --wait db`.

Para escribir varias consultas, entra a `psql`:

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Cuando veas un prompt como `inventory=#`, escribe una consulta completa y pulsa Enter:

```sql
SELECT 1;
```

El punto y coma termina la consulta. Usa `\dt` para listar tablas y `\q` para salir. Por ahora, `\dt` puede indicar que no hay relaciones porque todavía no se han creado modelos ni migraciones.

En Docker Desktop también puedes abrir el contenedor `db`, entrar en la pestaña **Exec** y ejecutar `psql -U inventory -d inventory` con los valores del `.env.example`. Luego usa los mismos comandos de `psql`.

## 11. Detener servicios y conservar los datos

Para detener los contenedores y eliminar la red de Compose:

```bash
docker compose down
```

El volumen conserva los datos. No uses `docker compose down -v` si quieres conservarlos: esa opción elimina el volumen.

Clonar el repositorio no copia los datos de otro integrante. Comparte el código y la configuración; cada computadora mantiene su volumen independiente.

Las variables `POSTGRES_*` inicializan PostgreSQL cuando su volumen está vacío. Cambiarlas después en `.env` no modifica automáticamente los usuarios, contraseñas o bases de datos existentes.

## 12. Problemas frecuentes

| Problema                              | Qué revisar                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Docker no conecta con su motor        | Abre Docker Desktop o inicia el motor correspondiente.                                                   |
| Puerto `3000` ocupado                 | Detén la app local o el servicio `app` de Compose antes de arrancar el otro modo.                        |
| Puerto `5432` ocupado                 | Revisa si ya tienes otro PostgreSQL o contenedor utilizando ese puerto.                                  |
| Falta una variable                    | Copia `.env.example` a `.env` si aún no existe y revisa sus valores.                                     |
| Prisma rechaza la conexión            | Comprueba que `db` esté sano y que las credenciales y el host sean correctos.                            |
| Cambié la contraseña y no funciona    | El volumen puede conservar la contraseña anterior; cambiar `.env` no cambia las credenciales existentes. |
| No se ven cambios de código en Docker | Reconstruye la imagen con `docker compose up --build`.                                                   |
| El commit se rechaza                  | Revisa la salida del lint o el formato del mensaje.                                                      |
| No se ejecutan los hooks              | Instala dependencias locales y ejecuta `npm run prepare`.                                                |
