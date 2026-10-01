"""태그 사전 YAML(정본)을 사람이 검토하기 쉬운 Markdown 표로 변환한다.

사용: python3 scripts/render_taxonomy.py taxonomy/tags-v0.1.yaml > taxonomy/tags-v0.1.md
YAML을 고친 뒤 다시 실행해 .md를 갱신한다. .md는 직접 고치지 않는다.
"""
import sys

import yaml

LAYER = {"A": "지식 자료", "B": "학생 사례", "AB": "공통"}


def main(path):
    tx = yaml.safe_load(open(path, encoding="utf-8"))
    out = [
        f"# 태그 사전 v{tx['version']} (검토용)",
        "",
        f"> `{path.split('/')[-1]}`에서 자동 생성 · {tx['updated']} · 이 파일은 직접 고치지 마세요.",
        "> 의견은 '검토 의견' 칸에 적거나 메시지로 알려 주시면 YAML에 반영합니다.",
        "",
        "## 항목 한눈에 보기",
        "",
        "| 항목 | 적용 대상 | 여러 개 선택 | 값 개수 |",
        "|---|---|---|---|",
    ]
    dims = tx["dimensions"]
    for key, d in dims.items():
        n = len(d.get("values", [])) or "별도 목록"
        out.append(f"| {d['label']} (`{key}`) | {LAYER[d['layer']]} | {'예' if d.get('multi') else '아니오'} | {n} |")

    for key, d in dims.items():
        out += ["", f"## {d['label']} (`{key}`) — {LAYER[d['layer']]}", ""]
        if d.get("note"):
            out += [f"- {d['note']}", ""]
        if not d.get("values"):
            continue
        out += ["| 값 | 코드 | 검토 의견 |", "|---|---|---|"]
        out += [f"| {v['label']} | `{v['code']}` | |" for v in d["values"]]

    ev = tx["outcome_scales"]["evaluation"]
    out += [
        "", "## 성과 지표", "",
        f"### 연차별 중간 평가 ({', '.join(ev['periods'])}, {ev['scale']}점)", "",
        "| 평가 기준 | 코드 | 검토 의견 |", "|---|---|---|",
    ]
    out += [f"| {c['label']} | `{c['code']}` | |" for c in ev["criteria"]]
    out += ["", "### 최종 결과", "", "| 값 | 코드 |", "|---|---|"]
    out += [f"| {v['label']} | `{v['code']}` |" for v in tx["outcome_scales"]["final_result"]["values"]]
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1])
