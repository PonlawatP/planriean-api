-- M20 / BUG-PLAN-02: user-edited or user-added subjects are standalone custom rows (not FK to course_detail).
CREATE TABLE public.plan_subject_custom (
    id bigserial PRIMARY KEY,
    plan_id integer NOT NULL REFERENCES public.plan_detail(plan_id) ON DELETE CASCADE,
    custom_key text NOT NULL,
    source_code character varying(255),
    source_sec integer,
    data jsonb NOT NULL,
    CONSTRAINT plan_subject_custom_plan_key UNIQUE (plan_id, custom_key)
);
