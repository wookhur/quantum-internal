-- 조회 예시 (001 스키마 기준). 파일럿에서 실제 데이터로 검증 예정.

-- [A층] 11학년 · 생명과학/프리메드 · 여름프로그램 관련 자료 (중복 제외, 최신 입시 연도)
SELECT s.title, s.url, s.valid_for_cycle
FROM sources s
WHERE s.duplicate_of IS NULL
  AND EXISTS (SELECT 1 FROM source_tags t WHERE t.source_id = s.source_id AND t.dimension = 'grade'        AND t.code = 'g11')
  AND EXISTS (SELECT 1 FROM source_tags t WHERE t.source_id = s.source_id AND t.dimension = 'major'        AND t.code = 'bio_premed')
  AND EXISTS (SELECT 1 FROM source_tags t WHERE t.source_id = s.source_id AND t.dimension = 'project_type' AND t.code = 'summer_program')
ORDER BY s.valid_for_cycle DESC;

-- [B층] 성공 사례만 벤치마크: 2년차 평균 4.0 이상인 공학 지망 학생의 리서치 프로젝트
SELECT st.student_id, p.title, p.target_audience, p.output, p.impact_metric, sc.avg_score
FROM students st
JOIN student_tags mt ON mt.student_id = st.student_id AND mt.dimension = 'major' AND mt.code = 'engineering'
JOIN student_period_scores sc ON sc.student_id = st.student_id AND sc.period = 'y2' AND sc.avg_score >= 4.0
JOIN projects p ON p.student_id = st.student_id
JOIN project_tags pt ON pt.project_id = p.project_id AND pt.dimension = 'project_type' AND pt.code = 'research'
ORDER BY sc.avg_score DESC;

-- [B층] 최종 합격자 vs 불합격자의 문제점 태그 빈도 비교
SELECT pt.code AS issue,
       SUM(CASE WHEN o.result IN ('admitted','enrolled') THEN 1 ELSE 0 END) AS admitted_cnt,
       SUM(CASE WHEN o.result = 'rejected' THEN 1 ELSE 0 END)               AS rejected_cnt
FROM project_tags pt
JOIN projects p ON p.project_id = pt.project_id
JOIN outcomes o ON o.student_id = p.student_id
WHERE pt.dimension = 'issue'
GROUP BY pt.code
ORDER BY rejected_cnt DESC;

-- [A+B] 특정 학생과 비슷한 성공 사례 + 관련 가이드를 함께 (LLM 보고서 입력용)
-- 1) 같은 전공·같은 목표학교 합격자 사례  2) 같은 전공·학년 태그의 지식 자료
