# Local API Python Workflow

## Goal

Backend local test execution 기준을 하나로 고정한다.

- API 로컬 가상환경 경로는 항상 `apps/api/.venv`
- backend 테스트 실행 기준 경로는 항상 `apps/api`
- `pytest` 실행 전에는 해당 가상환경을 먼저 활성화한다

## Scope

이 문서는 다음만 다룬다.

- 로컬 backend 가상환경 표준 위치
- 의존성 설치 표준 명령
- `pytest` 실행 표준 명령
- 작업 중 지켜야 할 운영 규칙

이 문서는 다음을 다루지 않는다.

- Python 설치 방법
- OS별 Python 탐색 방법
- PATH 문제 해결 일반론

위 항목은 로컬 개발 환경 책임이다. 이 문서는 `python` 명령이 이미 정상 동작한다는 전제에서 시작한다.

## Standard Location

Backend Python 가상환경은 항상 아래 경로를 사용한다.

```text
apps/api/.venv
```

허용하지 않는 패턴:

- 레포 루트 `.venv`
- 사용자 홈 디렉터리 공유 가상환경
- 임의 이름의 backend 가상환경 (`venv`, `env`, `.api-venv` 등)

이유:

- 작업자와 에이전트가 동일한 상대 경로 기준으로 움직일 수 있어야 한다
- README, 테스트 명령, 후속 문서가 같은 기준을 공유해야 한다
- “현재 어떤 venv를 써야 하는가”를 다시 판단하지 않도록 하기 위함이다

## Standard Setup

기준 작업 디렉터리:

```powershell
cd apps/api
```

가상환경 생성:

```powershell
python -m venv .venv
```

PowerShell 활성화:

```powershell
.\.venv\Scripts\Activate.ps1
```

macOS/Linux 활성화:

```bash
source .venv/bin/activate
```

패키지 설치:

```powershell
python -m pip install --upgrade pip
python -m pip install -e .[dev]
```

## Standard Test Commands

전체 backend 테스트:

```powershell
cd apps/api
.\.venv\Scripts\Activate.ps1
pytest -q
```

특정 API 테스트:

```powershell
cd apps/api
.\.venv\Scripts\Activate.ps1
pytest tests/api/test_imports_api.py -q
```

특정 서비스 테스트:

```powershell
cd apps/api
.\.venv\Scripts\Activate.ps1
pytest tests/services/test_import_service_series.py -q
```

가상환경을 활성화하지 않고 직접 실행해야 할 때:

```powershell
cd apps/api
.\.venv\Scripts\python.exe -m pytest -q
```

이 방식은 셸 활성화 상태에 의존하지 않으므로 자동화나 에이전트 작업에서 더 안정적이다.

## Agent Rule

에이전트가 backend 코드를 수정했으면 다음 순서를 기본값으로 사용한다.

1. `apps/api/.venv` 존재 확인
2. 없으면 생성 명령을 안내하거나 로컬 환경 미구축 상태로 보고
3. 있으면 `.\.venv\Scripts\python.exe -m pytest ...` 형태로 실행
4. backend 검증을 수행하지 못했으면 이유를 명시적으로 남김

중요한 점:

- `python`이 PATH에 없다고 해서 곧바로 “pytest 불가”로 결론내리지 않는다
- 먼저 `apps/api/.venv` 기준 경로를 확인한다
- 반대로, 실제 Python 인터프리터 없이 `venv`를 새로 만들 수는 없다

## Ignore Policy

가상환경과 테스트 캐시는 버전관리 대상이 아니다.

현재 레포 `.gitignore`에는 이미 아래 규칙이 포함되어 있다.

```text
.venv/
**/.venv/
**/.pytest_cache/
```

따라서 `apps/api/.venv`와 pytest 캐시는 별도 추가 작업 없이 무시된다.

## Operational Notes

- backend 관련 README와 문서는 모두 `apps/api/.venv` 기준을 따라야 한다
- 새로운 문서를 추가할 때도 다른 가상환경 이름을 예시로 들지 않는다
- CI/Docker 경로와 로컬 venv 경로는 분리해도 되지만, 로컬 수동 테스트 기준은 이 문서를 따른다

## Fast Failure Checklist

backend 테스트가 안 돌면 아래 순서로 본다.

1. `apps/api/.venv`가 존재하는가
2. `apps/api/.venv/Scripts/python.exe`가 존재하는가
3. `python -m pip install -e .[dev]`까지 완료됐는가
4. 작업 디렉터리가 `apps/api`인가
5. `pytest` 대신 `.\.venv\Scripts\python.exe -m pytest`로 직접 호출해봤는가

이 순서까지 확인하지 않았다면 로컬 backend 테스트 환경을 아직 제대로 판단한 것이 아니다.
