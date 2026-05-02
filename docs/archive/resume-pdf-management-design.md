# Resume PDF Management Design

## Goal

Footer에서 이력서 아이콘 버튼을 통해 공개 이력서 PDF를 새 탭으로 열 수 있게 하고, 파일이 없을 때는 안내를 보여준다. 이력서 PDF의 등록과 교체는 `/admin/imports`에서 처리한다.

## Recommended Approach

고정 object key 기반의 전용 resume 경로를 추가한다.

- 백엔드는 MinIO에 이력서 PDF를 단일 파일로 저장한다.
- 저장 위치는 고정 object key 하나만 사용한다.
- 공개 GET 경로는 PDF가 있으면 그대로 stream하고, 없으면 `404`와 메시지를 반환한다.
- admin 전용 업로드 경로는 multipart 업로드를 받아 기존 파일을 교체한다.
- 웹은 기존 `requestBackend` + internal-api proxy 패턴을 재사용한다.
- footer의 scroll 아이콘 버튼은 `/resume`을 새 탭으로 연다.

## Why This

- DB 테이블이나 설정 저장소를 새로 만들 필요가 없다.
- 기존 media 업로드 경계와 같은 object storage를 재사용할 수 있다.
- 저장 위치가 고정되어 경로 주입 표면이 작다.
- 공개 라우트와 admin 업로드를 분리해 권한 모델이 단순하다.

## Data Flow

### Public Open

1. 사용자가 footer의 resume 아이콘 버튼을 누른다.
2. 브라우저는 새 탭으로 `/resume`을 연다.
3. 웹 라우트가 백엔드 resume 공개 GET을 호출한다.
4. 파일이 있으면 `application/pdf`를 그대로 반환한다.
5. 파일이 없으면 간단한 안내 HTML을 반환한다.

### Admin Upload

1. admin 사용자가 `/admin/imports`에서 PDF를 선택한다.
2. 웹 internal-api route가 admin cookie를 검증한다.
3. route가 multipart 파일을 백엔드 resume 업로드 endpoint로 proxy한다.
4. 백엔드는 PDF 여부를 검증하고 고정 object key에 저장한다.
5. 웹 UI는 성공/실패 상태를 표시한다.

## Validation And Safety

- 확장자 `.pdf`만 보지 않고 `mime_type`과 파일 헤더 `%PDF-`를 같이 확인한다.
- object key는 서버 코드에서 상수로 결정한다.
- 파일명은 사용자 입력을 storage path에 반영하지 않는다.
- 업로드 권한은 기존 admin cookie 기반 internal-api route에서 막는다.

## UI Changes

- footer dock에 mail 왼쪽으로 scroll 아이콘 버튼 추가
- 버튼은 다른 footer 아이콘과 같은 원형 액션 스타일 재사용
- `/admin/imports`에 `Resume PDF` 카드 추가
- 업로드 버튼, 선택 파일 표시, 현재 등록 상태 표시, 업로드 결과 피드백 제공

## Testing

- API
  - 업로드 성공
  - 파일 미등록 상태 조회/다운로드
  - PDF가 아닌 파일 거부
- Web
  - footer에 resume 아이콘 존재
  - `/resume` 공개 라우트가 empty 상태와 proxy 상태를 모두 처리
  - `/admin/imports`에 resume 업로드 UI 존재
  - internal-api resume upload route가 admin cookie를 요구
