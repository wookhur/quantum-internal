"""태그 사전 YAML(정본) → Supabase cat.tags 적재 SQL.

사용: python3 scripts/build_tag_seed.py taxonomy/tags-v0.2.yaml > ../app/supabase/seed-cat-tags-v0.2.sql
사전에서 빠진 코드는 지우지 않고 deprecated = true 로 바꾼다(기존 태그 기록 보존).
"""
import sys

import yaml


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def main(path):
    tx = yaml.safe_load(open(path, encoding="utf-8"))
    ver = tx["version"]
    rows = [
        f"  ({q(dim)}, {q(v['code'])}, {q(v['label'])}, {q(d['layer'])}, {str(bool(v.get('deprecated'))).lower()}, {q(ver)})"
        for dim, d in tx["dimensions"].items()
        for v in d.get("values", [])
    ]
    print(f"-- 자동 생성: cat-db/scripts/build_tag_seed.py {path.split('/')[-1]} — 직접 고치지 말 것")
    print("BEGIN;")
    print("INSERT INTO cat.tags (dimension, code, label, layer, deprecated, taxonomy_version) VALUES")
    print(",\n".join(rows))
    print("ON CONFLICT (dimension, code) DO UPDATE SET label = EXCLUDED.label, layer = EXCLUDED.layer,")
    print("  deprecated = EXCLUDED.deprecated, taxonomy_version = EXCLUDED.taxonomy_version;")
    print(f"UPDATE cat.tags SET deprecated = true WHERE taxonomy_version <> {q(ver)};")
    print("COMMIT;")


if __name__ == "__main__":
    main(sys.argv[1])
