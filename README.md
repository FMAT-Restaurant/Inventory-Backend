# Inventory Backend

Backend de inventario con NestJS, Mongoose y MongoDB. Esta guía permite preparar el proyecto desde cero, arrancarlo de dos formas, consultar su documentación OpenAPI y comprobar la conexión a la base de datos.

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
| Mongoose           | ODM y módulo `@nestjs/mongoose` integrado en `DatabaseModule`.            |
| OpenAPI            | Documentación interactiva y especificación `openapi.yml` generada.        |
| MongoDB            | Servicio `db` de Compose, con MongoDB 7.0.                                |
| App + db en Docker | `Dockerfile` para NestJS y `compose.yaml` con ambos servicios.            |
| Linting            | Oxlint, ejecutado mediante `npm run lint`.                                |
| Husky              | Hooks de Git instalados mediante el script `prepare`.                     |
| Commitlint         | Validación del mensaje del commit con Conventional Commits.               |

El proyecto ofrece la infraestructura inicial. Aún no hay modelos de inventario en MongoDB.

## 2. Requisitos para trabajar

- Git, para clonar el repositorio y utilizar los hooks.
- Node.js y npm, para desarrollar fuera del contenedor. La versión del proyecto está fijada en `.nvmrc` (`22.23.3`).
- Docker con Compose. En macOS puedes utilizar Docker Desktop u OrbStack y mantener su motor ejecutándose.
- Puertos `3000` y `27017` disponibles en tu computadora.

Comprueba las herramientas antes de continuar:

```bash
node --version
npm --version
docker compose version
docker info
```

Si `docker info` no puede conectar, inicia Docker Desktop o el motor de Docker y vuelve a intentarlo.

En esta configuración se usa `docker compose`, con espacio. El archivo de configuración es `compose.yaml`.

## 3. Preparar el entorno después de clonar

Ejecuta los comandos desde la raíz del repositorio:

```bash
cp .env.example .env
npm ci
```

Copia `.env.example` solamente si todavía no tienes tu `.env`. No sobrescribas una configuración local existente. En PowerShell, el comando de copia es `Copy-Item .env.example .env`.

`npm ci` instala las versiones resueltas en `package-lock.json`. Al finalizar, npm ejecuta:

- `prepare`: activa Husky en este repositorio.

Si trabajas exclusivamente con los contenedores, Docker instala las dependencias de la app durante la construcción. Para que los hooks funcionen al hacer commits desde tu computadora, necesitas también las dependencias locales y la ejecución de `prepare`.

### Variables de entorno

El archivo de ejemplo contiene:

```dotenv
MONGO_INITDB_ROOT_USERNAME=inventory
MONGO_INITDB_ROOT_PASSWORD=inventory_dev
MONGO_INITDB_DATABASE=inventory
MONGODB_URI=mongodb://inventory:inventory_dev@localhost:27017/inventory?authSource=admin
PORT=3000
```

| Variable                     | Para qué sirve                                               |
| ---------------------------- | ------------------------------------------------------------ |
| `MONGO_INITDB_ROOT_USERNAME` | Usuario administrador que MongoDB crea al iniciar volumen.  |
| `MONGO_INITDB_ROOT_PASSWORD` | Contraseña de ese usuario.                                   |
| `MONGO_INITDB_DATABASE`      | Base de datos inicial.                                       |
| `MONGODB_URI`                | Dirección de conexión de Mongoose al trabajar localmente.   |
| `PORT`                       | Puerto de NestJS al trabajar localmente.                     |

Son valores de ejemplo para desarrollo. Cada integrante puede usar los mismos: tendrá una base de datos independiente en su computadora.

`.env` se excluye de Git. `.env.example` sí se comparte en el repositorio.

Para mantener la configuración sencilla, utiliza los valores del ejemplo. Si los cambias, actualiza también `MONGODB_URI`. Compose construye la URI internamente usando las variables `MONGO_INITDB_*`.

## 4. Cómo levantar todo en Docker

Abre Docker Desktop o tu motor de Docker y ejecuta:

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
Navegador → localhost:3000 → app (NestJS + Mongoose) → db:27017 (MongoDB)
```

Abre `http://localhost:3000/`. El endpoint inicial responde `Hello World!`.

### Cómo está configurado Docker Compose

**Servicio `db`:**

- Usa la imagen `mongo:7.0`.
- Lee las credenciales de `.env` mediante la interpolación de Compose.
- Publica MongoDB en el puerto `27017` de tu computadora.
- Guarda los datos en el volumen `mongo_data`, montado en `/data/db`.
- Su `healthcheck` ejecuta `mongosh --eval "db.adminCommand('ping')"`.

**Servicio `app`:**

- Construye la imagen usando el `Dockerfile` del proyecto.
- Publica NestJS en el puerto `3000`.
- Recibe `PORT=3000` y una `MONGODB_URI` construida con las credenciales y el host `db`.
- Espera a que `db` esté sano mediante `depends_on` y `condition: service_healthy`.
- Su `healthcheck` comprueba que el endpoint inicial responda correctamente por HTTP.

Dentro del contenedor, `localhost` corresponde al propio contenedor. Por eso la app utiliza `db`, el nombre del servicio de MongoDB.

### Cómo está configurado el Dockerfile

1. Parte de `node:22-bookworm-slim`.
2. Trabaja en `/app`.
3. Define `HUSKY=0` para omitir la instalación de hooks dentro del contenedor.
4. Copia los archivos de dependencias `package.json` y `package-lock.json`.
5. Ejecuta `npm ci`.
6. Copia el resto del proyecto y compila con `npm run build`.
7. Arranca con `npm run start:dev`.

`.dockerignore` evita copiar dependencias locales, archivos compilados, Git, hooks y el `.env` a la imagen.

## 5. Cómo desarrollar con NestJS local y MongoDB en Docker

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
NestJS + Mongoose en tu computadora → localhost:27017 → MongoDB en Docker
```

`start:dev` ejecuta `nest start --watch`, que recompila y reinicia la app cuando cambias el código.

Para detener NestJS local, presiona `Ctrl+C` en su terminal.

Para volver a ejecutar la app dentro de Docker, primero detén NestJS local y después ejecuta `docker compose up -d --build --wait`.

## 6. Cómo se integró Mongoose con NestJS

El proyecto utiliza `@nestjs/mongoose` y `mongoose` en su versión más reciente.

### Archivos de integración con NestJS

- `src/database/database.module.ts`: configura la conexión con MongoDB mediante `MongooseModule.forRootAsync`, obteniendo la URI desde la variable `MONGODB_URI` o `DATABASE_URL`. Además, supervisa los eventos de conexión (`connected`, `error`, `disconnected`) mostrando logs claros.
- `src/app.module.ts`: importa `DatabaseModule` para integrarlo en la aplicación.
- `src/main.ts`: permite escuchar conexiones en `0.0.0.0` y activa los hooks de cierre de NestJS.

Al iniciar la app y conectarse con MongoDB, muestra:

```text
[DatabaseModule] Conexion con MongoDB verificada
```

## 7. Documentación OpenAPI

Con la aplicación encendida, abre <http://localhost:3000/api> para ver y probar los endpoints en Swagger UI. El documento JSON está en <http://localhost:3000/api-json>. Actualmente describe el endpoint inicial `GET /`; al agregar endpoints se incluirán en el documento generado por NestJS.

Para generar el archivo YAML que se adjuntará a un release:

```bash
npm run openapi:generate
```

El comando compila la aplicación y escribe `openapi.yml` en la raíz. No necesita una base de datos en ejecución: crea el documento sin arrancar el servidor ni abrir una conexión activa. El archivo se genera automáticamente en CI y al publicar un release, por lo que está excluido de Git.

`src/openapi.config.ts` concentra el título y la versión del documento. Si defines `APP_VERSION`, esa versión aparecerá en el YAML; el workflow de release la obtiene del tag `vX.Y.Z`.

## 8. Linting, Husky y Commitlint

### Linting: revisar el código

Oxlint revisa `src/` y `test/`:

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

Los controles se ejecutan en la computadora donde se hace el commit; no dentro de MongoDB ni de la app en Docker.

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

Un mensaje como `cambios` se rechaza porque no tiene la estructura requerida.

Después de preparar tus archivos con `git add`, puedes crear un commit así:

```bash
git commit -m "chore: configurar infraestructura del backend con mongoose"
```

## 9. CI y releases en GitHub

El workflow `.github/workflows/on_pr.yml` se ejecuta cuando se abre o actualiza un pull request hacia `main`, y cuando hay un push a `main`. Instala dependencias y ejecuta lint, pruebas unitarias, compilación y generación de OpenAPI. Usa la versión de Node definida en `.nvmrc`.

El workflow `.github/workflows/release.yml` se ejecuta al publicar un tag que coincida con `v*.*.*`, por ejemplo `v1.0.0`. Genera notas a partir de los commits mediante `scripts/changelog.sh`, genera `openapi.yml` con la versión del tag y crea un GitHub Release con ambos elementos.

## 10. Cómo verificar la configuración

### Compilación y pruebas locales

```bash
npm run lint
npm run build
npm test
npm run openapi:generate
```

Para las pruebas e2e con la base de datos levantada:

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

Ambos servicios deben aparecer como `healthy`. Los logs de la app deben mostrar la confirmación de la conexión (`Conexion con MongoDB verificada`), y la solicitud HTTP debe responder `Hello World!`.

### Ejecutar consultas en MongoDB

Para comprobar la conexión a MongoDB desde la terminal:

```bash
docker compose exec db mongosh -u inventory -p inventory_dev --authenticationDatabase admin --eval "db.adminCommand('ping')"
```

Debe retornar `{ ok: 1 }`.

Para entrar a la consola interactiva `mongosh`:

```bash
docker compose exec db mongosh -u inventory -p inventory_dev --authenticationDatabase admin inventory
```

Usa comandos como `show collections` y `exit` para salir.

## 11. Detener servicios y conservar los datos

Para detener los contenedores y eliminar la red de Compose:

```bash
docker compose down
```

El volumen conserva los datos. No uses `docker compose down -v` si quieres conservarlos: esa opción elimina el volumen.

Las variables `MONGO_INITDB_*` inicializan MongoDB cuando su volumen está vacío. Cambiarlas después en `.env` no modifica automáticamente los usuarios o contraseñas existentes en el volumen de datos persistente.

## 12. Problemas frecuentes

| Problema                              | Qué revisar                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Docker no conecta con su motor        | Abre Docker Desktop u OrbStack e inicia el motor correspondiente.                                        |
| Puerto `3000` ocupado                 | Detén la app local u otro proceso en el puerto 3000 antes de arrancar Docker.                            |
| Puerto `27017` ocupado                | Revisa si ya tienes otro MongoDB o contenedor utilizando ese puerto.                                     |
| Falta una variable                    | Copia `.env.example` a `.env` si aún no existe y revisa sus valores.                                     |
| Mongoose rechaza la conexión          | Comprueba que el servicio `db` esté sano y que las credenciales y host sean correctos.                   |
| Cambié la contraseña y no funciona    | El volumen puede conservar la contraseña anterior; borrar el volumen o recrearlo si estás en desarrollo.|
| No se ven cambios de código en Docker | Reconstruye la imagen con `docker compose up --build`.                                                   |
| El commit se rechaza                  | Revisa la salida del lint o el formato del mensaje.                                                      |
| No se ejecutan los hooks              | Instala dependencias locales y ejecuta `npm run prepare`.                                                |

## Code Quality
This project uses SonarQube Cloud for static code analysis.