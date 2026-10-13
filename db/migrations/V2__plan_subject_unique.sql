-- H7: one row per (plan_id, code, sec). Remove existing duplicates first (keep one arbitrary physical row).
DELETE FROM public.plan_subject a
USING public.plan_subject b
WHERE a.plan_id = b.plan_id AND a.code = b.code AND a.sec = b.sec AND a.ctid > b.ctid;

ALTER TABLE public.plan_subject
    ADD CONSTRAINT plan_subject_plan_code_sec_key UNIQUE (plan_id, code, sec);
