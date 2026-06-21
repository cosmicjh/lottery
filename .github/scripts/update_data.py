"""Parse a GitHub Issue Form body and upsert the round into data/*.json.

Triggered by .github/workflows/update-data.yml on issues:opened.
Writes success/message to GITHUB_OUTPUT for the workflow to comment/close with.
"""
import json
import os
import re


def parse_issue_body(body):
    """GitHub Issue Forms render as '### Label\\n\\nvalue\\n\\n### Label2...'"""
    fields = {}
    parts = re.split(r"^### (.+)$", body, flags=re.MULTILINE)
    for i in range(1, len(parts), 2):
        label = parts[i].strip()
        value = parts[i + 1].strip() if i + 1 < len(parts) else ""
        fields[label] = value
    return fields


def load_json(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    data.sort(key=lambda d: -d["round"])
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def upsert(data, round_, entry):
    return [d for d in data if d["round"] != round_] + [entry]


def parse_lotto(fields):
    errors = []
    round_ = None
    try:
        round_ = int(fields.get("회차", "").strip())
    except ValueError:
        errors.append("회차는 숫자여야 합니다.")

    nums_raw = fields.get("당첨번호 6개 (쉼표로 구분)", "")
    parts = [s for s in re.split(r"[,\s]+", nums_raw) if s]
    try:
        nums = sorted(int(n) for n in parts)
    except ValueError:
        errors.append("번호는 숫자여야 합니다.")
        nums = []
    if nums:
        if len(nums) != 6:
            errors.append(f"번호는 6개여야 합니다 (입력: {len(nums)}개).")
        elif any(n < 1 or n > 45 for n in nums):
            errors.append("번호는 1~45 범위여야 합니다.")
        elif len(set(nums)) != 6:
            errors.append("중복된 번호가 있습니다.")

    bonus = None
    try:
        bonus = int(fields.get("보너스 번호", "").strip())
        if not (1 <= bonus <= 45):
            errors.append("보너스 번호는 1~45 범위여야 합니다.")
        elif bonus in nums:
            errors.append("보너스 번호가 당첨번호와 중복됩니다.")
    except ValueError:
        errors.append("보너스 번호는 숫자여야 합니다.")

    if errors:
        return None, errors
    return {"round": round_, "nums": nums, "bonus": bonus}, []


def parse_pension(fields):
    errors = []
    round_ = None
    try:
        round_ = int(fields.get("회차", "").strip())
    except ValueError:
        errors.append("회차는 숫자여야 합니다.")

    group = None
    try:
        group = int(fields.get("조", "").strip())
        if not (1 <= group <= 5):
            errors.append("조는 1~5 범위여야 합니다.")
    except ValueError:
        errors.append("조는 숫자여야 합니다.")

    digits_raw = re.sub(r"\D", "", fields.get("당첨번호 6자리", ""))
    if len(digits_raw) != 6:
        errors.append(f'번호는 6자리 숫자여야 합니다 (입력: "{digits_raw}").')
        digits = []
    else:
        digits = [int(c) for c in digits_raw]

    if errors:
        return None, errors
    return {"round": round_, "group": group, "digits": digits}, []


def main():
    body = os.environ["ISSUE_BODY"]
    labels = json.loads(os.environ["ISSUE_LABELS"])
    fields = parse_issue_body(body)

    if "lotto-entry" in labels:
        path = "data/lotto.json"
        entry, errors = parse_lotto(fields)
    elif "pension-entry" in labels:
        path = "data/pension.json"
        entry, errors = parse_pension(fields)
    else:
        path, entry, errors = None, None, ["알 수 없는 라벨입니다."]

    if not errors:
        data = load_json(path)
        data = upsert(data, entry["round"], entry)
        save_json(path, data)
        success, message = True, f"✅ {entry['round']}회 저장 완료"
    else:
        success, message = False, "❌ 입력 오류:\n" + "\n".join(f"- {e}" for e in errors)

    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
        f.write(f"success={'true' if success else 'false'}\n")
        f.write(f"message<<EOF_MSG\n{message}\nEOF_MSG\n")


if __name__ == "__main__":
    main()
