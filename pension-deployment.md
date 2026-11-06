# GitHub 적용 및 GitHub Pages / Actions 운영 안내

## 1. 적용 전 백업

1. <https://github.com/cosmicjh/lottery>에서 현재 기본 브랜치 `main`을 확인한다.
2. 기존 저장소의 최신 ZIP 또는 새 브랜치를 백업한다. 특히 `data/lotto.json`, `data/weekly.json`, `data/study.json`과 기존 예측 시점 기록을 보호한다.
3. 이 결과물은 **새로 첨부된 `lottery-main(2).zip` (2026-11-06 기준)**을 기준으로 작성했다. 적용 시 최신 `main`과 차이가 있으면 패치로 충돌 여부를 먼저 확인한다.

## 2. 안전한 적용 방법

권장: 새 브랜치에서 이미 통합된 연금복권 버전을 기준으로 `lottery-pension-history-backfill.patch`를 적용한다. `lottery-main(2).zip`에는 패치 대신 전체 통합 ZIP을 사용한다.

```bash
# 이 패치는 이전 통합본(lottery-pension-improved-from-2.zip)에만 적용 가능
# 기존 lottery-main(2).zip만 있는 경우에는 전체 통합 ZIP을 사용
cd <이미-연금복권-통합본의-프로젝트-루트>
git checkout -b pension-history-backfill
# 패치 파일을 프로젝트 루트에 복사했다고 가정
git apply --check lottery-pension-history-backfill.patch
git apply lottery-pension-history-backfill.patch
node --test tests/*.test.mjs
python tools/pension-independent-check.py
```

패치 적용에 실패하면 원격 저장소가 첨부 ZIP 이후 수정되었을 수 있다. 충돌하는 파일을 검토하여 수동 병합한다. **기존 데이터를 임의 삭제하거나 일괄 덮어쓰지 않는다.** `lottery-pension-history-backfill.zip`을 사용하는 경우에는 저장소 루트에 파일들을 압축 해제하되, **현재 운영 중인 모든 `data/*.json`을 우선 백업·비교하고 기존 수집·사전 예측 기록을 유지한다.** 전체 ZIP에 포함된 빈 연금복권 결과 파일로 운영 중인 실제 수집 결과를 덮어쓰면 안 된다.

## 3. Actions 및 Pages

- 기존 `.github/workflows/lotto-pages.yml` 워크플로 유지 및 확장. GitHub Pages 소스는 `GitHub Actions`로 둔다.
- 기존 일요일/월요일 KST 09:17 실행 외 목요일 KST 20:20 예약 실행을 추가한다. 추첨은 공식 기준 목요일 약 19:05, 온라인 당일 판매 마감은 17:00.
- 테스트 완료 후 기존 로또와 별도로 `node scripts/collect-pension.mjs`, `node scripts/record-pension.mjs`를 순서대로 실행한다.
- 연금복권 수집 실패는 기존 데이터 보존 후 **배포는 계속 시도**, 작업 상태를 실패로 표기하는 구조이다. 신규 공식 데이터 파일은 확인되지 않은 내용을 기입하지 않는다.
- 기존 `public/data/` 배포에 연금복권 3종 JSON을 추가하고, 브라우저 ES module을 위해 `public/scripts/portfolio.js`를 그대로 유지하면서 `public/scripts/pension720.mjs`, `pension-research.mjs`, `pension-ui.mjs`를 추가한다.

## 4. 공식 데이터 초기 수집

- 공식 API 후보: `https://www.dhlottery.co.kr/pt720/selectPstPt720Info.do`.
- **운영 API 응답 스키마 및 이용조건은 직접 확인되지 않았다.** 현재 코드에서는 `data.result` 아래에서 `wnSqNo=1`와 `wnSqNo=21`이 모두 존재하고, 조·6자리·회차·목요일 날짜가 명확해야만 저장한다.
- Actions 로그에서 `공식 확인 ... 회` 메시지를 확인한다. 현재 기본 연금복권 결과 파일은 `draws: []`이다.
- 개선 후에는 전체 이력 일괄 조회를 먼저 시도하고, 실패하거나 일부 회차가 누락되면 기본 실행에서 최대 20개를 개별 보충한다. 자세한 방법은 아래 8장 참조.
- 기존 로또 이력과 연금복권 이력을 혼용하거나 6자리 번호를 정수로 변환하지 않는다.

## 5. 번호와 연구 기록

- 구매용 번호 버전: `pension720-suffix-v1`. 기본 5장 접미부 분산.
- 자동 기록은 공식 최신 추첨 회차와 날짜를 확보하고 다음 목요일 **17:00 이전**인 경우에만 최초 추가한다. 동일 버전·동일 회차의 기록은 덮어쓰지 않는다.
- 최근 100개 연속 공식 회차를 확보한 경우 `pension720-dirichlet-v1`의 **연구전용** 자리별 확률을 별도 파일에 사전 기록한다. 결합번호 예측 우위 주장 및 구매용 반영 없음.
- 브라우저에서 생성한 번호 기록은 이 기기의 localStorage에 저장되며, **사전 시각 인증이나 구매 증명**으로 인정하지 않는다.

## 6. 검증 절차와 주의사항

1. 배포 URL을 열어 상단 `로또 6/45`와 `연금복권720+` 전환이 가능한지 확인한다.
2. 로또 v1/v2 기능과 기록이 기존과 동일한지 확인한다.
3. 연금복권 5장 분산 모드에서 본 추첨 7등 이상 50%가 표시되는지 확인한다.
4. 집중 모드에서 5개 조 동일 6자리·본 추첨 7등 이상 10%가 표시되는지 확인한다.
5. 전략 비교의 기대당첨금 동일성, 위험 차이, 보너스 포함 확률, 6자리 선행0 보존, 직접 수정 후 재계산을 확인한다.
6. 공식 데이터가 없는 경우 '미수집' 상태 표시 및 수동 회차 입력을 확인한다.
7. 실 판매마감/추첨 시각은 반드시 공식 동행복권 안내를 따르고, 구매 가능한 번호인지 구매 화면에서 다시 확인한다.

원격 저장소에 직접 커밋하거나 GitHub Actions를 실제 구동한 것은 아니다. 모든 확인은 적용 후 GitHub에서 최종 재검증해야 한다.


## 7. 이번 새 ZIP 기준 병합 시 주의점

- 이 패치의 **적용 기준은 반드시 `lottery-main(2).zip`의 압축을 해제한 프로젝트 루트**이다. 최초 `lottery-main(1).zip`에 적용할 목적으로 만들어진 패치와 서로 호환된다고 가정하면 안 된다.
- 원본의 `scripts/portfolio.js`, `tests/portfolio.test.mjs`, `tools/`, `research/`를 삭제하거나 교체하지 않는다.
- `index.html`에 6/45 기존 대시보드와 `portfolio.js` 로딩이 살아 있어야 한다. `lotto`/`pension` 탭을 전환하여 검증한다.
- 통합 검증: `node --test tests/*.test.mjs` (과거 수집 보완 후 101개 테스트).
- Python 독립 검증: `python tools/pension-independent-check.py`.
- GitHub Actions의 public 디렉터리에는 **기존 `portfolio.js`와 신규 연금복권 ES 모듈이 모두** 복사되어야 한다.
- 브라우저 네트워크 접근은 이 실행 환경에서 정책에 의해 차단되었으므로, 브라우저 버튼 작동과 CORS·운영 API 응답은 배포 후 실환경에서 반드시 확인한다.

## 8. 과거 전체 당첨번호 수집 보완 (2026-11-06)

### 적용 소스 및 안전장치

- **일괄 수집 우선:** `https://www.dhlottery.co.kr/pt720/selectPstPt720WnList.do`에서 과거 회차 전체를 읽는다. 공개 페이지에서 사용하는 공식 호스트의 엔드포인트이나 별도의 공식 개발자 API 안정성 보장은 확인되지 않았다.
- **개별 보완:** 일괄 수집 오류 또는 일부 회차 누락 시 `https://www.dhlottery.co.kr/pt720/selectPstPt720Info.do?srchPsltEpsd=회차`로 개별 조회한다. 최신 회차를 먼저 별도 확인한다.
- **검증:** 회차·날짜(목요일)·조·6자리 당첨번호·보너스 번호, 선행 0, 중복 및 과거 값과의 충돌을 확인한다. 유효하지 않은 데이터로 기존 기록을 덮어쓰지 않는다.
- **저장과 복구:** 정상 수신된 회차마다 `*.tmp` 파일을 만들고 원본과 원자적으로 교체한다. 실패했을 때 이미 저장된 회차는 보존하며 다음 실행 시 누락 회차만 보완한다.
- **누락과 날짜 경고:** `lastVerifiedRound`, `completeThroughRound`, `missingCount`, `missingRounds`, `dateSequenceWarnings`를 JSON에 기록한다. 연속 회차의 추첨일 간격이 7일이 아니면 경고만 남기고 임의로 변경하지 않는다.
- **서버 부하 제한:** 기본 모드의 개별 누락 회차 조회는 1회 실행당 최대 20건, `--full` 옵션에서는 최대 1000건이다. 연속 3회 실패 시 중단하며 영구적 오류에 대한 불필요한 재시도를 피한다.

### GitHub Actions — 최초 1회 전체 이력 수집

1. 수정 파일을 저장소의 새 브랜치에 적용하고 `node --test tests/*.test.mjs`를 실행한다.
2. `main`에 병합한 후 GitHub **Actions → Lotto Pages → Run workflow**를 연다.
3. `pension_full_history` 옵션을 **true**로 선택해 수동 실행한다.
4. 실행 로그의 `연금복권 결과: 전체 API 성공/미확인, 저장 n회, 신규 n회, 누락 n회`를 확인한다.
5. `data/pension720-results.json`의 `missingCount`가 0인지 확인한다. 실패 또는 누락이 있으면 수동 실행을 반복한다.
6. 이후에는 기존 예약 실행에서 전체 API 우선 조회 후 필요시 개별 회차를 보충한다.

### 로컬 수집 명령

```bash
# Node.js 22 이상, 프로젝트 최상위에서 실행
node scripts/collect-pension.mjs --full      # 초기 전체 이력 확인 및 누락 보완
node scripts/collect-pension.mjs             # 평상시 전체 조회 우선, 최대 20회 개별 보완
node scripts/collect-pension.mjs --limit=50  # 개별 보완 횟수 직접 지정
node --test tests/pension-backfill.test.mjs  # 네트워크 불필요, 가상 API 테스트
```

**주의:** 현재 제공 ZIP의 `data/pension720-results.json`은 실제 당첨 이력이 미수집 상태이다. 실행 환경에서 동행복권 호스트의 실제 응답을 받을 수 없으므로 전체 회차 수집 성공을 주장하지 않는다. 인터넷 접근 가능한 GitHub Actions 또는 로컬 환경에서 최초 수집과 로그 확인이 필요하다.

이 보완의 패치는 `lottery-pension-history-backfill.patch`이며 **이미 연금복권 모듈이 통합된 `lottery-pension-improved-from-2.zip` 프로젝트**를 대상으로 한다. 기존 `lottery-main(2).zip`에 직접 적용하는 패치가 아니다. 전체 통합 프로젝트는 `lottery-pension-history-backfill.zip`이다.
