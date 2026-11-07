# ADA-08: Agent-Ready Repository
**Ingeniería de Software Asistida por IA**

> **Pregunta guía:**  
> Si un coding agent recibe este repositorio sin contexto previo, ¿puede entender qué hace, dónde debe modificar, cómo validar el cambio y qué NO debe tocar, sin inventar reglas ni depender de conocimiento tribal?

---

## 1. Objetivo
Auditar un repositorio desde la perspectiva de un *coding agent*, identificar fricción y riesgos, implementar mejoras de contexto, navegación, validación y seguridad, y demostrar con evidencia cuantitativa y cualitativa que el repositorio quedó mejor preparado para trabajo *agentic*.

---

## 2. Resultado esperado
Al finalizar el ADA, el repositorio deberá permitir que un agente:
* Entienda rápidamente el propósito y la estructura del proyecto.
* Encuentre las fuentes de verdad y las instrucciones aplicables.
* Sepa cómo ejecutar, probar y validar cambios.
* Respete límites de arquitectura, alcance y permisos.
* Produzca evidencia reproducible antes de afirmar que una tarea está terminada.
* Reduzca la necesidad de aclaraciones y las modificaciones fuera de alcance.

---

## 3. Modelo mental
$$\text{Intento} \rightarrow \text{Contexto} \rightarrow \text{Planificación} \rightarrow \text{Herramientas} \rightarrow \text{Ejecución} \rightarrow \text{Observación} \rightarrow \text{Verificación}$$

Un agente no trabaja solamente con el modelo. Su desempeño depende del repositorio que lo rodea: instrucciones, estructura, herramientas, comandos reproducibles, permisos, tests, guardrails y evidencia.

---

## 4. Qué significa Agent-Ready

| No es... | Sí es... |
| :--- | :--- |
| Un README enorme con todo el conocimiento del proyecto. | Contexto mínimo, estructurado y descubrible. |
| Agregar más prompts al agente. | Hacer explícitas reglas, rutas, comandos y límites. |
| Confiar en que el agente "entienda" la arquitectura. | Documentar boundaries y hacerlos verificables. |
| Pedir "ten cuidado" o "no rompas nada". | Usar tests, scripts, hooks y políticas que detecten fallas. |
| Optimizar para un solo modelo. | Diseñar un repo usable por humanos y distintos coding agents. |

### 4.1. Discoverability: reducir el conocimiento oculto
Un repositorio es más *agent-ready* cuando la información necesaria para completar una tarea puede descubrirse desde el propio repositorio. El agente no debería depender de que una persona le indique manualmente qué archivo leer, qué comando ejecutar, qué test valida el cambio o cuál documento es la fuente de verdad.

> **Pregunta de discoverability:**  
> *Can the agent discover the correct file, command, test and source of truth without being told manually?*

---

## 5. Escenario del ADA
Trabaja sobre un repositorio real. No crees un repositorio nuevo y perfecto desde cero: se necesita medir una condición **BEFORE**.

> **Regla del ejercicio:**  
> Primero se preserva el baseline y se realiza la auditoría BEFORE. Después se ejecuta el agente. Las mejoras de *repository readiness* se aplican únicamente después de conservar la evidencia BEFORE.

---

## 6. Tarea controlada para medir BEFORE y AFTER
Define una modificación pequeña pero no trivial. La misma tarea se utilizará en BEFORE y AFTER. Debe requerir comprensión del contexto, cambios de código y validación.

### Ejemplos aceptables:
* Agregar un filtro a una búsqueda existente.
* Agregar una validación de entrada y su prueba.
* Modificar un endpoint sin romper compatibilidad.
* Corregir un bug con criterio de aceptación conocido.
* Agregar un campo a una salida manteniendo contratos existentes.

### No uses como tarea de medición:
* Cambiar un texto o comentario.
* Renombrar una variable.
* Generar únicamente documentación.
* Una tarea cuyo resultado correcto no pueda verificarse.

---

### 6.1. Convención de idioma
Las instrucciones para el estudiante, la rúbrica y la reflexión pueden estar en español. Los artefactos técnicos que consume directamente el agente deben redactarse en inglés para mantener consistencia.

| Español | Inglés |
| :--- | :--- |
| Instrucciones del ADA | `AGENTS.md` |
| Explicaciones conceptuales | `REQUIREMENTS.md` / `SPEC.md` / `ARCHITECTURE.md` / `TASKS.md` |
| Rúbrica y reflexión | `TASK_UNDER_TEST.md` / `REPO_MAP.md` |
| Indicaciones de entrega | Prompts de ejecución / templates técnicos / scripts |

---

### 6.2. TASK_UNDER_TEST.md
La tarea debe referenciar requisitos y criterios de aceptación existentes. No debe redefinirlos ni convertirse en una segunda fuente de verdad.

```markdown
# Task Under Test

Change ID: CR-___

## Goal
Describe the bounded software change to implement.

## Requirements Covered
- FR-___
- AC-___

## Verification
Describe the observable evidence that will prove the change works.

## Constraints
- Use REQUIREMENTS.md and SPEC.md as the source of truth.
- Keep changes scoped to this task.
- Do not redefine requirements in this file.
```

---

### 6.3. Protocolo experimental BEFORE/AFTER
La comparación solo es válida si BEFORE y AFTER parten del mismo estado funcional del código. La variable que debe cambiar es la preparación del repositorio para trabajo *agentic*.

1. Crea un commit o tag de baseline antes de la auditoría (por ejemplo, `ada08-baseline`).
2. Realiza la auditoría BEFORE sobre ese baseline.
3. Ejecuta BEFORE en una rama o worktree derivada del baseline y conserva la evidencia.
4. No reutilices la implementación generada durante BEFORE como punto de partida para AFTER.
5. Restaura o crea otra rama/worktree desde el mismo baseline funcional.
6. Aplica únicamente las mejoras de *Agent-Ready Repository*: instrucciones, mapa, scripts, hooks, guardrails y documentación operativa.
7. Ejecuta AFTER en una sesión limpia con la misma tarea, el mismo prompt y, siempre que sea posible, el mismo agente/modelo, herramientas y permisos.
8. Documenta cualquier variable que no hayas podido mantener constante.

> **Validez de la comparación:**  
> BEFORE y AFTER no comparan dos implementaciones distintas. Comparan el comportamiento del agente frente al mismo cambio, partiendo del mismo código funcional, con un repositorio no preparado vs. un repositorio preparado para trabajo *agentic*.

---

## 7. Repository Readiness Audit - BEFORE
Completa esta auditoría antes de ejecutar el agente y antes de realizar mejoras de *repository readiness*. Cada dimensión se califica con 0, 1, 2, 3, 4 o 5 y se convierte al peso indicado.

| Dimensión | Peso | Qué se evalúa |
| :--- | :---: | :--- |
| **1. Entry Point & Navigation** | 15 | El agente puede descubrir propósito, estructura, archivos relevantes, comandos, tests y fuentes de verdad sin depender de instrucciones manuales. |
| **2. Agent Instructions** | 15 | `AGENTS.md` define reglas del proyecto, source of truth, comandos, límites y Definition of Done. |
| **3. Build / Run / Test** | 15 | Comandos reproducibles para instalar, ejecutar, probar y validar. |
| **4. Architecture Boundaries** | 10 | Componentes, responsabilidades y dependencias están explícitas; el agente sabe dónde NO modificar. |
| **5. Requirements & Traceability** | 10 | Requirements/spec/tasks se conectan por IDs o referencias y evitan duplicación/conflictos. |
| **6. Automation & Guardrails** | 10 | Scripts, lint, hooks o CI convierten reglas importantes en verificaciones automáticas y reutilizables por humanos y agentes. |
| **7. Testability & Evidence** | 15 | Hay pruebas relevantes, criterios verificables y una ruta clara para demostrar que el cambio funciona. |
| **8. Safety & Permissions** | 10 | Secretos, archivos sensibles, operaciones destructivas y acciones externas tienen límites explícitos. |

$$\text{Puntos dimensión} = \left(\frac{\text{Score } 0 \text{ a } 5}{5}\right) \times \text{Peso}$$

El total debe quedar entre 0 y 100.

---

## 8. Escala de puntuación

| Score | Interpretación |
| :---: | :--- |
| **0** | Ausente. El agente debe inferirlo. |
| **1** | Existe de forma parcial, obsoleta o ambigua. |
| **2** | Útil solo con conocimiento previo del proyecto. |
| **3** | Suficiente para un humano, pero genera fricción para un agente. |
| **4** | Claro, verificable y normalmente suficiente para trabajo agentic. |
| **5** | Explícito, reproducible, seguro y validado por automatización/evidencia. |

Registra el baseline en `REPOSITORY_READINESS_AUDIT.md`:

```markdown
# Repository Readiness Audit

## BEFORE

| Dimension | Score 0-5 | Weighted | Evidence / Main Gap |
| :--- | :---: | :---: | :--- |
| Entry Point & Navigation | /5 | /15 | |
| Agent Instructions | /5 | /15 | |
| Build / Run / Test | /5 | /15 | |
| Architecture Boundaries | /5 | /10 | |
| Requirements & Traceability | /5 | /10 | |
| Automation & Guardrails | /5 | /10 | |
| Testability & Evidence | /5 | /15 | |
| Safety & Permissions | /5 | /10 | |

**TOTAL BEFORE: ___ / 100**

Top 3 friction points:
1. 
2. 
3. 
```

---

## 9. Ejecución BEFORE
En una sesión limpia del agente, utiliza exactamente el siguiente prompt en inglés. No expliques manualmente la estructura del repositorio ni agregues pistas adicionales.

```text
Implement the change described in TASK_UNDER_TEST.md.

Before making any changes:
- inspect the repository,
- identify the relevant project context,
- determine how the project is built, tested, and validated,
- respect the existing architecture and repository conventions.

When finished:
- run the appropriate validation,
- report the files modified,
- report the commands executed,
- provide evidence that the requested change works.

Do not ask for additional repository context unless it is necessary to proceed safely.
```

Registra la evidencia en `results/before-agent-run.md`. El reporte técnico debe usar encabezados en inglés e incluir:
* Clarification questions requested by the agent
* Files explored to understand the repository
* Incorrect assumptions
* Failed or unknown commands
* Out-of-scope files modified
* Tests/validations executed or skipped
* Final result: PASS / PARTIAL / FAIL

```markdown
# BEFORE Agent Run

## Run Context
- Agent:
- Model:
- Tools:
- Permissions:
- Baseline commit/tag:

## Clarification Questions
## Repository Exploration
## Incorrect Assumptions
## Failed / Unknown Commands
## Out-of-Scope Changes
## Validation Evidence
## Final Result
PASS / PARTIAL / FAIL
```

---

### 9.1. Identifica el conocimiento implícito
Después de la ejecución BEFORE, identifica un tipo de información que un integrante experimentado conoce pero que el agente tuvo que inferir, buscar indirectamente o simplemente no pudo descubrir. Registra esa deuda de contexto antes de decidir cómo remediarla en `results/implicit-knowledge.md`.

```markdown
# Implicit Knowledge Found

## IK-01
- **What:** The test command is pytest.
- **How was it discovered:** By inspecting pyproject.toml.
- **Should this remain implicit?** NO
- **Where should it become explicit?** AGENTS.md / scripts/verify_repo.sh

## IK-02
- **What:** Files under generated/ must not be edited.
- **How was it discovered:** Not documented.
- **Risk:** The agent could modify generated artifacts.
- **Remediation:** AGENTS.md + repository check.
```

> **De conocimiento tribal a evidencia:**  
> No todo conocimiento implícito debe convertirse en más documentación. Si una regla puede validarse de forma determinista, prefiere convertirla en un script, hook, test o check ejecutable.

---

## 10. Diseña las mejoras
No se trata de llenar el repositorio de archivos. Corrige los puntos de mayor fricción con el menor contexto posible y convierte reglas críticas en mecanismos verificables.

### 10.1. Clasifica cada mejora
Cada cambio debe atacar una fricción observada en BEFORE. Clasifícalo para evitar la conclusión equivocada de que hacer un repositorio *agent-ready* consiste solamente en agregar archivos Markdown.

| Categoría | Ejemplo | Propósito |
| :--- | :--- | :--- |
| **Context** | `AGENTS.md` | Explicitar instrucciones y fuentes de verdad. |
| **Navigation** | `docs/REPO_MAP.md` | Hacer descubribles entry points, tests y boundaries. |
| **Executable Knowledge** | `scripts/verify_repo.sh` | Convertir conocimiento operativo en comandos reproducibles. |
| **Guardrail** | protected-path check | Bloquear o detectar acciones fuera de límites. |
| **Test** | regression test | Convertir comportamiento esperado en evidencia ejecutable. |
| **CI Check** | GitHub Actions / CI equivalente | Ejecutar los mismos checks fuera de la sesión del agente. |
| **Human Gate** | architecture approval | Reservar decisiones de alto impacto para revisión humana. |

```markdown
## Changes Made

### Improvement I-01
- **Category:** Context
- **Problem:** Test command was undocumented.
- **Change:** Added Standard Commands to AGENTS.md.
- **Evidence:** ...

### Improvement I-02
- **Category:** Guardrail
- **Problem:** generated/ could be modified.
- **Change:** Added a deterministic protected-path check.
- **Evidence:** ...
```

---

## 11. Mejora 1 - AGENTS.md como contrato operativo
Crea o mejora `AGENTS.md`. Debe ser corto y útil. Debe incluir:
* Qué documentos leer primero.
* Cuáles son las fuentes de verdad.
* Un mapa breve del repositorio.
* Comandos oficiales de instalación, ejecución, test, lint y validación.
* Reglas de cambio: qué puede y qué no puede modificar.
* Definition of Done.
* Stop conditions: cuándo detenerse y pedir decisión humana.

```markdown
# AGENTS.md

## Read First
1. REQUIREMENTS.md
2. SPEC.md
3. ARCHITECTURE.md
4. TASKS.md
5. docs/REPO_MAP.md

## Sources of Truth
- Requirements live only in REQUIREMENTS.md.
- Verifiable behavior lives in SPEC.md.
- Do not change requirements/spec merely to make tests pass.

## Repository Map
- `src/`: implementation
- `tests/`: automated tests
- `docs/`: architecture and operational context
- `scripts/`: deterministic checks
- `results/`: generated evidence

## Standard Commands
- Install:
- Run:
- Test:
- Lint:
- Verify: `./scripts/verify_repo.sh`

## Change Rules
- Keep changes scoped to the requested task.
- Do not weaken existing tests.
- Do not introduce new dependencies without justification.
- Do not modify secrets or generated files.

## Stop Conditions
Stop and ask for human input when:
- requirements conflict,
- a destructive action is required,
- an architecture boundary must change,
- a required external system is unavailable.

## Definition of Done
...
```

> **Evita duplicación:**  
> `AGENTS.md` no debe reescribir Requirements ni Architecture. Debe indicar dónde están, cuál es la fuente de verdad y cómo utilizarlos.

---

## 12. Mejora 2 - Tool-specific instructions sin crear nuevas verdades
Si usas `CLAUDE.md`, `GEMINI.md`, Copilot instructions u otro archivo específico del agente, úsalo como adaptador, no como una segunda fuente de verdad.

```markdown
# GEMINI.md / CLAUDE.md (example)

Follow the repository-wide instructions in AGENTS.md.

Before implementation:
1. Read the files listed in AGENTS.md.
2. Produce a short plan.
3. Identify the tests that will verify the requested behavior.

Do not duplicate project requirements here.
```

---

## 13. Mejora 3 - REPO_MAP.md
Crea `docs/REPO_MAP.md`. Debe permitir responder rápidamente: "¿dónde está lo que necesito?"

```markdown
# Repository Map

## Entry Points
- `src/app.py`: application bootstrap
- `src/api/`: API routes
- `src/domain/`: business rules
- `src/storage/`: persistence

## Tests
- `tests/unit/`
- `tests/integration/`

## Change Guide
If changing API behavior:
1. Check REQUIREMENTS.md / SPEC.md
2. Update `src/api/`
3. Update the domain layer only if business behavior changes
4. Add or modify tests
5. Run `./scripts/verify_repo.sh`

## Do Not Edit Directly
- `generated/`
- `.env`
- production configuration
```

---

## 14. Mejora 4 - Verificación reproducible
Crea un único comando que represente el conjunto mínimo de verificaciones que un agente debe ejecutar antes de declarar DONE. Puede llamar a otros scripts existentes.

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "[1/3] Running tests"
pytest -q

echo "[2/3] Running lint"
# Replace with the linter used by your project
ruff check . # example only

echo "[3/3] Repository checks"
python scripts/check_repo_contract.py

echo "VERIFY REPO: PASS"
```
*(El archivo puede llamarse `scripts/verify_repo.sh` o equivalente para tu stack).*

### 14.1. CI como contrato ejecutable compartido
El mismo comando de verificación que utiliza el agente localmente debe poder ejecutarse de manera independiente en tu integración continua (por ejemplo, GitHub Actions en `.github/workflows/verify.yml`). No dupliques la lógica dentro del pipeline: CI debe invocar el mismo `scripts/verify_repo.sh`.

```yaml
name: Repository Verification
on:
  pull_request:
  push:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -r requirements.txt
      - run: ./scripts/verify_repo.sh
```

> **Un solo contrato de verificación:**  
> Human developer $\rightarrow$ `verify_repo.sh` $\leftarrow$ Coding agent; CI ejecuta el mismo contrato.

---

## 15. Mejora 5 - Rules, hooks y guardrails
Selecciona al menos una regla crítica y conviértela en un gate automatizado.

| Regla | Mala implementación | Mejor implementación |
| :--- | :--- | :--- |
| **No dejar tests rotos** | Texto: "Always run tests". | Hook/script ejecuta tests y falla si hay error. |
| **No agregar secretos** | Texto: "Do not expose secrets". | Secret scan o pattern check. |
| **No modificar `generated/`** | Texto en prompt. | Script detecta cambios en paths prohibidos. |
| **No romper formato** | Recordatorio al agente. | Formatter/linter en `verify_repo`. |

> **Principio:**  
> Una regla importante que solo existe en lenguaje natural sigue siendo una petición. Un guardrail verificable convierte esa intención en una restricción observable.

---

## 16. `check_repo_contract.py` - ejemplo
Implementa al menos una comprobación determinista de readiness.

```python
from pathlib import Path
import sys

required = [
    "AGENTS.md",
    "README.md",
    "REQUIREMENTS.md",
    "SPEC.md",
    "ARCHITECTURE.md",
    "TASKS.md",
    "docs/REPO_MAP.md",
]

missing = [path for path in required if not Path(path).exists()]

if missing:
    print("REPO CONTRACT: FAIL")
    for path in missing:
        print(f"Missing: {path}")
    sys.exit(1)

print("REPO CONTRACT: PASS")
sys.exit(0)
```

Puedes ampliar el script para validar:
* Que `SPEC.md` contenga referencias a IDs de requisitos.
* Que `AGENTS.md` incluya los comandos estándar.
* Que no existan archivos sensibles versionados.
* Que el directorio `results/` exista.
* Que la documentación no apunte a rutas inexistentes.

---

## 17. Ejecuta nuevamente la misma tarea - AFTER
Parte nuevamente del mismo baseline funcional y aplica solo las mejoras de *repository readiness*. Abre una sesión nueva del mismo *coding agent* usando el mismo prompt de la ejecución BEFORE y la misma `TASK_UNDER_TEST.md`.

```text
Implement the change described in TASK_UNDER_TEST.md.

Before making any changes:
- inspect the repository,
- identify the relevant project context,
- determine how the project is built, tested, and validated,
- respect the existing architecture and repository conventions.

When finished:
- run the appropriate validation,
- report the files modified,
- report the commands executed,
- provide evidence that the requested change works.

Do not ask for additional repository context unless it is necessary to proceed safely.
```

Registra en `results/after-agent-run.md` los mismos indicadores para compararlos directamente:

| Indicador | BEFORE | AFTER |
| :--- | :--- | :--- |
| **Clarification questions** | | |
| **Failed/unknown commands** | | |
| **Incorrect assumptions** | | |
| **Out-of-scope files modified** | | |
| **Validations executed correctly** | | |
| **Final result** | PASS / PARTIAL / FAIL | PASS / PARTIAL / FAIL |
| **Qualitative observation** | | |
| **Discoverability** | El agente puede descubrir archivos relevantes, comandos, tests y fuentes de verdad sin pistas manuales. | |
| **Implicit Knowledge** | `results/implicit-knowledge.md` documenta conocimiento tribal detectado y su remediación. | |
| **Clasificación de mejoras** | Cada mejora se etiqueta como Context, Navigation, Executable Knowledge, Guardrail, Test, CI Check o Human Gate. | |
| **CI / shared checks** | El pipeline de CI ejecuta el mismo contrato de verificación local o se documenta el mecanismo equivalente. | |

---

## 18. Repository Readiness Audit - AFTER
Repite la misma rúbrica en `REPOSITORY_READINESS_AUDIT.md`.

```markdown
## AFTER

| Dimension | Score 0-5 | Weighted | Evidence | Improvement |
| :--- | :---: | :---: | :--- | :--- |
| Entry Point & Navigation | /5 | /15 | | |
| Agent Instructions | /5 | /15 | | |
| Build / Run / Test | /5 | /15 | | |
| Architecture Boundaries | /5 | /10 | | |
| Requirements & Traceability | /5 | /10 | | |
| Automation & Guardrails | /5 | /10 | | |
| Testability & Evidence | /5 | /15 | | |
| Safety & Permissions | /5 | /10 | | |

**TOTAL AFTER: ___ / 100**  
**DELTA (AFTER - BEFORE): +___ points**
```

> **Objetivo recomendado:**  
> Score AFTER de $\ge 80/100$, y mejora mínima de $+15$ puntos respecto al BEFORE.

---

## 19. Análisis de impacto
Crea `results/readiness-improvement-report.md`. Las mejoras que hacen un repositorio más usable para agentes normalmente también reducen la fricción de nuevos integrantes humanos del equipo.

---

## 20. Ejemplo resumido - Task Manager

| Dimensión | Before | Problema | Mejora | After |
| :--- | :---: | :--- | :--- | :---: |
| **Navigation** | 2/5 | README solo explica cómo ejecutar. | REPO_MAP + entry points. | 5/5 |
| **Instructions** | 1/5 | No existe AGENTS.md. | AGENTS.md con SoT, commands, stop conditions. | 5/5 |
| **Build/Test** | 3/5 | pytest existe, lint no documentado. | verify_repo.sh. | 5/5 |
| **Architecture** | 2/5 | Capas implícitas. | Architecture + map de boundaries. | 4/5 |
| **Traceability** | 3/5 | Req y spec existen pero no conectados. | IDs + references. | 4/5 |
| **Guardrails** | 1/5 | Solo instrucciones naturales. | repo contract + lint/test gate. | 4/5 |
| **Tests/Evidence**| 3/5 | Tests presentes, DoD ambiguo. | DoD verificable + evidence report. | 5/5 |
| **Safety** | 2/5 | No hay paths protegidos. | Stop conditions + protected paths. | 4/5 |

**Ejemplo de score:** BEFORE: 42/100 $\rightarrow$ AFTER: 90/100 $\rightarrow$ **Delta +48**

---

## 21. Estructura mínima de entrega

```text
ada-08-agent-ready-repository/
├── AGENTS.md
├── README.md
├── REQUIREMENTS.md
├── SPEC.md
├── ARCHITECTURE.md
├── TASKS.md
├── TASK_UNDER_TEST.md
├── REPOSITORY_READINESS_AUDIT.md
├── AI_USAGE_LOG.md
├── .github/
│   └── workflows/
│       └── verify.yml
├── docs/
│   └── REPO_MAP.md
├── scripts/
│   ├── verify_repo.sh
│   └── check_repo_contract.py
├── tests/
└── results/
    ├── before-agent-run.md
    ├── implicit-knowledge.md
    ├── after-agent-run.md
    └── readiness-improvement-report.md
```

---

## 22. Definition of Done

| Condición | Evidencia |
| :--- | :--- |
| **Baseline preservado** | Existe commit/tag del estado funcional común para BEFORE y AFTER. |
| **Audit BEFORE** | 8 dimensiones calificadas antes de ejecutar el agente, con evidencia y score /100. |
| **BEFORE** | Se ejecuta desde el baseline con el prompt oficial y se conserva evidencia. |
| **AGENTS.md** | Define fuentes de verdad, mapa, comandos, reglas, stop conditions y DoD. |
| **Repo Map** | Permite ubicar entry points, tests, boundaries y rutas protegidas. |
| **Validación reproducible** | Existe un comando/script único de verificación. |
| **Guardrail automatizado** | Al menos una regla crítica se verifica de forma determinista. |
| **Comparabilidad** | AFTER parte del mismo baseline y usa la misma tarea/prompt. |
| **AFTER** | Se ejecuta en sesión limpia y no reutiliza la implementación de BEFORE. |
| **Audit AFTER** | Mismas dimensiones y pesos; delta calculado. |
| **Evidence** | Tests/comandos, errores, límites y resultado documentados. |
| **Safety** | No se modifican secretos ni se ejecutan acciones destructivas sin aprobación. |
| **AI Usage Log** | Decisiones relevantes y cambios aceptados/rechazados documentados. |

---

## 23. AI_USAGE_LOG.md
Incluye al menos 5 entradas significativas:
1. **Auditoría inicial:** qué detectó el agente y qué validaste tú.
2. **Diseño de AGENTS.md:** qué sugerencias aceptaste/rechazaste.
3. **Guardrail:** qué regla convertiste a software y por qué.
4. **Ejecución AFTER:** qué cambió en el comportamiento del agente.
5. **Evaluación final:** qué limitación del repositorio sigue requiriendo intervención humana.
6. **Discoverability / implicit knowledge:** qué información estaba oculta y cómo decidiste hacerla explícita o ejecutable.
7. **CI:** qué verificaciones decidiste compartir entre humano, agente y pipeline, y por qué.

---

## 24. Reflexión individual
1. ¿Cuál fue el principal obstáculo para el agente en la ejecución BEFORE?
2. ¿Qué información tuvo que inferir el agente que un desarrollador experimentado ya conocía?
3. ¿Qué mejora produjo el mayor impacto y por qué?
4. ¿Qué información pertenece en `AGENTS.md` y qué información NO debería vivir ahí?
5. ¿Qué regla convertiste en software/hook/script en lugar de dejarla como instrucción?
6. ¿Qué diferencia observaste entre "más contexto" y "mejor contexto"?
7. ¿Qué riesgo aparece cuando `CLAUDE.md`/`GEMINI.md`/copilot instructions duplican información del proyecto?
8. ¿Qué checks comparten ahora el agente, el desarrollador humano y CI?
9. ¿Qué parte del proceso sigue requiriendo decisión humana?
10. ¿Qué evidencia demuestra que el AFTER es realmente mejor?
11. ¿Qué mejora realizada para el agente también beneficia a un desarrollador que entra por primera vez al proyecto?
12. ¿Qué variable no controlada podría afectar tu comparación BEFORE/AFTER?
13. ¿Qué elementos de este ADA conservarás como base para tu proyecto final?