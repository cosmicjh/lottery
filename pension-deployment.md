# GitHub 적용 및 GitHub Pages / Actions 운영 안내

## 1. 적용 전 백업

1. <https://github.com/cosmicjh/lottery>에서 현재 기본 브랜치 `main`을 확인한다.
2. 기존 저장소의 최신 ZIP 또는 새 브랜치를 백업한다. 특히 `data/lotto.json`, `data/weekly.json`, `data/study.json`과 기존 예측 시점 기록을 보호한다.
3. 이 결과물은 **새로 첨부된 `lottery-main(2).zip` (2026-11-06 기준)**을 기준으로 작성했다. 적용 시 최신 `main`과 차이가 있으면 패치로 충돌 여부를 먼저 확인한다.

## 2. 안전한 적용 방법

권장: 새 브랜치에서 `lottery-pension-changes-from-2.patch`를 사용하여 변경 내용을 확인한다.

```bash
git clone https://github.com/cosmicjh/lottery.git
cd lottery
git checkout -b add-pension720
# patch를 한 단계 상위 또는 현재 폴더에 복사했다고 가정
git apply --check lottery-pension-changes.patch
git apply lottery-pension-changes.patch
node --test tests/*.test.mjs
python tools/pension-independent-check.py
```

패치 적용에 실패하면 원격 저장소가 첨부 ZIP 이후 수정되었을 수 있다. 충돌하는 파일을 검토하여 수동 병합한다. **기존 데이터를 임의 삭제하거나 일괄 덮어쓰지 않는다.** `lottery-pension-improved-from-2.zip`을 사용하는 경우에는 저장소 루트에 파일들을 압축 해제하되 기존 데이터 3개와 기존 자동화 설정은 반드시 백업 후 비교한다.

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
- 이전 결과는 실행 1회당 최대 20개 누락 회차를 검증해 채운다. 많은 기간이 필요할 수 있다. 실제 공식 API의 부하 제한이나 형식 변경이 발생하면 수집이 중단되고 기존 파일은 보호된다.
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
- 통합 검증: `node --test tests/*.test.mjs` (이번 산출물 85개 테스트).
- Python 독립 검증: `python tools/pension-independent-check.py`.
- GitHub Actions의 public 디렉터리에는 **기존 `portfolio.js`와 신규 연금복권 ES 모듈이 모두** 복사되어야 한다.
- 브라우저 네트워크 접근은 이 실행 환경에서 정책에 의해 차단되었으므로, 브라우저 버튼 작동과 CORS·운영 API 응답은 배포 후 실환경에서 반드시 확인한다.
