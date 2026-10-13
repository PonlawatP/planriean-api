--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15 (Debian 16.15-1.pgdg13+2)
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--



SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: course_detail; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_detail (
    uni_id integer,
    year integer,
    semester integer,
    code character varying(255),
    name_en character varying(255),
    name_th character varying(255),
    note character varying(255),
    credit character varying(255),
    "time" character varying(255),
    sec integer,
    lecturer text,
    exam_mid character varying(255),
    exam_final character varying(255),
    cr_id integer NOT NULL,
    suj_real_code character varying(255)
);


--
-- Name: course_detail_cr_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.course_detail_cr_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    MAXVALUE 2147483647
    CACHE 1;


--
-- Name: course_detail_cr_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.course_detail_cr_id_seq OWNED BY public.course_detail.cr_id;


--
-- Name: course_seat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_seat (
    seat_remain integer,
    seat_available integer,
    cr_id integer NOT NULL
);


--
-- Name: courseset_detail; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courseset_detail (
    name_th character varying(255),
    credit integer,
    year integer,
    lowset_grade numeric(10,2),
    fac_id integer,
    cr_id integer NOT NULL,
    cr_key character varying(255),
    uni_id integer,
    og_link text,
    courseset_id integer NOT NULL,
    major_key_ref integer,
    cr_group_id integer,
    name_en character varying(255),
    is_updated boolean DEFAULT false NOT NULL
);


--
-- Name: courseset_detail_courseset_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.courseset_detail_courseset_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    MAXVALUE 2147483647
    CACHE 1;


--
-- Name: courseset_detail_courseset_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.courseset_detail_courseset_id_seq OWNED BY public.courseset_detail.courseset_id;


--
-- Name: courseset_group; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courseset_group (
    cr_group_id integer NOT NULL,
    name_en character varying(255),
    name_th character varying(255),
    uni_id integer
);


--
-- Name: courseset_group_cr_group_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.courseset_group_cr_group_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    MAXVALUE 2147483647
    CACHE 1;


--
-- Name: courseset_group_cr_group_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.courseset_group_cr_group_id_seq OWNED BY public.courseset_group.cr_group_id;


--
-- Name: courseset_header; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courseset_header (
    cr_id integer,
    fac_id integer,
    uni_id integer,
    cr_head_id character varying(255),
    cr_name_en character varying(255),
    cr_name_th character varying(255),
    cr_id_ref integer,
    fac_id_ref integer,
    uni_id_ref integer,
    cr_head_id_ref character varying(255),
    cr_min_credit_ref integer
);


--
-- Name: courseset_restrictgrp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courseset_restrictgrp (
    name_en character varying(255),
    name_th character varying(255),
    cr_restgrp_id integer NOT NULL,
    std_year integer,
    term integer,
    cr_id integer NOT NULL,
    uni_id integer NOT NULL,
    create_at date
);


--
-- Name: courseset_restrictgrp_cr_restgrp_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.courseset_restrictgrp_cr_restgrp_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    MAXVALUE 2147483647
    CACHE 1;


--
-- Name: courseset_restrictgrp_cr_restgrp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.courseset_restrictgrp_cr_restgrp_id_seq OWNED BY public.courseset_restrictgrp.cr_restgrp_id;


--
-- Name: courseset_subject; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courseset_subject (
    cr_id integer,
    fac_id integer,
    uni_id integer,
    cr_head_id character varying(255),
    suj_id character varying(255),
    suj_name_en character varying(255),
    suj_name_th character varying(255),
    suj_credit character varying(255),
    suj_pre_req text,
    suj_real_id character varying,
    suj_pre_req_updated boolean DEFAULT false,
    suj_desc_th text,
    suj_desc_en text
);


--
-- Name: courseset_subjectplan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courseset_subjectplan (
    cr_id integer NOT NULL,
    std_year integer,
    suj_id character varying(255),
    credit character varying(255),
    term integer,
    cr_subjplan_id integer NOT NULL
);


--
-- Name: courseset_subjectplan_cr_subjplan_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.courseset_subjectplan_cr_subjplan_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    MAXVALUE 2147483647
    CACHE 1;


--
-- Name: courseset_subjectplan_cr_subjplan_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.courseset_subjectplan_cr_subjplan_id_seq OWNED BY public.courseset_subjectplan.cr_subjplan_id;


--
-- Name: place_room; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.place_room (
    place_id character varying(255),
    floor integer,
    room_name_en character varying(255),
    room_name_th character varying(255),
    room_desc_en character varying(255),
    room_desc_th character varying(255),
    room_img character varying(255),
    uni_id integer,
    room_id character varying(255)
);


--
-- Name: plan_detail; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_detail (
    plan_name character varying(255),
    user_uid integer,
    cr_year character varying(255),
    cr_seamseter character varying(255),
    uni_id integer,
    fac_id integer,
    major_id integer,
    plan_color character varying(255),
    plan_img character varying(255),
    plan_dark boolean DEFAULT false,
    is_folder boolean DEFAULT false,
    "ref_folder-plan_id" integer,
    create_at date,
    plan_id integer NOT NULL,
    status character varying(255),
    update_at timestamp(6) without time zone,
    is_delete boolean DEFAULT false,
    std_year integer,
    cr_id integer,
    plan_settings json
);


--
-- Name: plan_detail_plan_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.plan_detail_plan_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    MAXVALUE 2147483647
    CACHE 1;


--
-- Name: plan_detail_plan_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.plan_detail_plan_id_seq OWNED BY public.plan_detail.plan_id;


--
-- Name: plan_subject; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_subject (
    plan_id integer,
    year integer,
    seamster integer,
    code character varying(255),
    sec integer,
    mute_alert boolean DEFAULT false,
    uni_id integer,
    suj_real_code character varying(255)
);


--
-- Name: restrictgrp_subject; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.restrictgrp_subject (
    cr_restgrp_id integer NOT NULL,
    suj_id character varying(255),
    sec integer
);


--
-- Name: restrictgrp_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.restrictgrp_user (
    cr_restgrp_id integer NOT NULL,
    std_id character varying(255)
);


--
-- Name: subject_review; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subject_review (
    uid integer,
    suj_real_code character varying(255),
    content character varying(1000),
    images json,
    created_at timestamp without time zone DEFAULT CURRENT_DATE,
    updated_at timestamp without time zone,
    flag json,
    badge json,
    review_id integer NOT NULL,
    uni_id integer,
    std_semester integer,
    std_year integer,
    rate integer,
    sec integer,
    anonymous boolean DEFAULT true
);


--
-- Name: review_entries_review_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.review_entries_review_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: review_entries_review_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.review_entries_review_id_seq OWNED BY public.subject_review.review_id;


--
-- Name: seamster_detail; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seamster_detail (
    year integer,
    uni_id integer,
    seamster_round integer,
    seamster_id integer NOT NULL
);


--
-- Name: seamster_detail_seamster_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seamster_detail_seamster_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    MAXVALUE 2147483647
    CACHE 1;


--
-- Name: seamster_detail_seamster_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.seamster_detail_seamster_id_seq OWNED BY public.seamster_detail.seamster_id;


--
-- Name: seamster_rounding; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seamster_rounding (
    ss_round integer,
    ss_start date,
    ss_end date,
    std_year integer,
    seamster_id integer
);


--
-- Name: university_detail; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.university_detail (
    uni_key character varying(255) NOT NULL,
    uni_name_en character varying(255),
    uni_name_th character varying(255),
    uni_logo character varying(255),
    uni_id integer NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    refresh_updated_at timestamp(6) without time zone
);


--
-- Name: university_faculty; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.university_faculty (
    fac_id integer NOT NULL,
    fac_key character varying(255),
    fac_name_en character varying(255),
    fac_name_th character varying(255),
    bg_img character varying(255),
    bg_color character varying(255),
    icon character varying(255),
    place_key character varying(255),
    uni_id integer,
    enabled boolean DEFAULT false
);


--
-- Name: university_major; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.university_major (
    fac_id integer,
    major_id integer,
    major_name_en character varying(255),
    major_name_th character varying(255),
    bg_img character varying(255),
    bg_color character varying(255),
    icon character varying(255),
    place_key character varying(255),
    uni_id integer,
    major_key integer NOT NULL
);


--
-- Name: university_major_major_key_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.university_major_major_key_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    MAXVALUE 2147483647
    CACHE 1;


--
-- Name: university_major_major_key_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.university_major_major_key_seq OWNED BY public.university_major.major_key;


--
-- Name: university_place; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.university_place (
    place_id character varying(255) DEFAULT NULL::character varying NOT NULL,
    uni_id integer,
    place_name_en character varying(255),
    place_name_th character varying(255),
    place_desc_en character varying(255),
    place_desc_th character varying(255),
    place_img character varying(255)
);


--
-- Name: university_place_place_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.university_place_place_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    MAXVALUE 2147483647
    CACHE 1;


--
-- Name: university_place_place_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.university_place_place_id_seq OWNED BY public.university_place.place_id;


--
-- Name: user_additionrole; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_additionrole (
    uid integer NOT NULL,
    fac_id integer,
    major_id integer,
    role character varying(255),
    uni_id integer
);


--
-- Name: user_detail; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_detail (
    username character varying(255),
    password character varying(255),
    uni_id integer,
    fac_id integer,
    major_id integer,
    std_id character varying(255),
    cr_id integer,
    image character varying(255),
    std_name character varying(255),
    std_surname character varying(255),
    phone character varying(255),
    email character varying(255),
    auth_reg_username character varying(255),
    create_at date,
    uid integer NOT NULL,
    std_start_year character varying(255),
    otp character varying(255),
    otp_expires_at timestamp without time zone,
    otp_created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: user_detail_uid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_detail_uid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    MAXVALUE 2147483647
    CACHE 1;


--
-- Name: user_detail_uid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_detail_uid_seq OWNED BY public.user_detail.uid;


--
-- Name: user_subjecthistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_subjecthistory (
    uid integer NOT NULL,
    subj_id character varying(255),
    study_term integer,
    study_year integer,
    grade character varying(255),
    score character varying(255),
    uni_id integer
);


--
-- Name: course_detail cr_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_detail ALTER COLUMN cr_id SET DEFAULT nextval('public.course_detail_cr_id_seq'::regclass);


--
-- Name: courseset_detail courseset_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courseset_detail ALTER COLUMN courseset_id SET DEFAULT nextval('public.courseset_detail_courseset_id_seq'::regclass);


--
-- Name: courseset_group cr_group_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courseset_group ALTER COLUMN cr_group_id SET DEFAULT nextval('public.courseset_group_cr_group_id_seq'::regclass);


--
-- Name: courseset_restrictgrp cr_restgrp_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courseset_restrictgrp ALTER COLUMN cr_restgrp_id SET DEFAULT nextval('public.courseset_restrictgrp_cr_restgrp_id_seq'::regclass);


--
-- Name: courseset_subjectplan cr_subjplan_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courseset_subjectplan ALTER COLUMN cr_subjplan_id SET DEFAULT nextval('public.courseset_subjectplan_cr_subjplan_id_seq'::regclass);


--
-- Name: plan_detail plan_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_detail ALTER COLUMN plan_id SET DEFAULT nextval('public.plan_detail_plan_id_seq'::regclass);


--
-- Name: seamster_detail seamster_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seamster_detail ALTER COLUMN seamster_id SET DEFAULT nextval('public.seamster_detail_seamster_id_seq'::regclass);


--
-- Name: subject_review review_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_review ALTER COLUMN review_id SET DEFAULT nextval('public.review_entries_review_id_seq'::regclass);


--
-- Name: university_major major_key; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.university_major ALTER COLUMN major_key SET DEFAULT nextval('public.university_major_major_key_seq'::regclass);


--
-- Name: user_detail uid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_detail ALTER COLUMN uid SET DEFAULT nextval('public.user_detail_uid_seq'::regclass);


--
-- Name: course_detail course_detail_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_detail
    ADD CONSTRAINT course_detail_pkey PRIMARY KEY (cr_id);


--
-- Name: course_seat course_seat_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_seat
    ADD CONSTRAINT course_seat_pkey PRIMARY KEY (cr_id);


--
-- Name: courseset_detail courseset_detail_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courseset_detail
    ADD CONSTRAINT courseset_detail_pkey PRIMARY KEY (courseset_id);


--
-- Name: courseset_restrictgrp courseset_restrictgrp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courseset_restrictgrp
    ADD CONSTRAINT courseset_restrictgrp_pkey PRIMARY KEY (cr_restgrp_id);


--
-- Name: courseset_subjectplan courseset_subjectplan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courseset_subjectplan
    ADD CONSTRAINT courseset_subjectplan_pkey PRIMARY KEY (cr_subjplan_id);


--
-- Name: plan_detail plan_detail_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_detail
    ADD CONSTRAINT plan_detail_pkey PRIMARY KEY (plan_id);


--
-- Name: subject_review review_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_review
    ADD CONSTRAINT review_entries_pkey PRIMARY KEY (review_id);


--
-- Name: seamster_detail seamster_detail_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seamster_detail
    ADD CONSTRAINT seamster_detail_pkey PRIMARY KEY (seamster_id);


--
-- Name: courseset_group uk_cr_group_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courseset_group
    ADD CONSTRAINT uk_cr_group_id UNIQUE (cr_group_id);


--
-- Name: course_seat uk_cr_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_seat
    ADD CONSTRAINT uk_cr_id UNIQUE (cr_id);


--
-- Name: courseset_detail uk_cr_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courseset_detail
    ADD CONSTRAINT uk_cr_key UNIQUE (cr_id, fac_id, uni_id);


--
-- Name: courseset_header uk_cr_ref; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courseset_header
    ADD CONSTRAINT uk_cr_ref UNIQUE (uni_id, fac_id, cr_id, cr_head_id);


--
-- Name: university_faculty uk_fac_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.university_faculty
    ADD CONSTRAINT uk_fac_id UNIQUE (fac_id, uni_id);


--
-- Name: user_detail uk_gg; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_detail
    ADD CONSTRAINT uk_gg UNIQUE (email);


--
-- Name: university_place uk_place; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.university_place
    ADD CONSTRAINT uk_place UNIQUE (uni_id, place_id);


--
-- Name: plan_detail uk_plan_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_detail
    ADD CONSTRAINT uk_plan_id UNIQUE (plan_id);


--
-- Name: course_detail uk_realcourse; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_detail
    ADD CONSTRAINT uk_realcourse UNIQUE (uni_id, year, semester, code, sec, suj_real_code);


--
-- Name: seamster_detail uk_seamster; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seamster_detail
    ADD CONSTRAINT uk_seamster UNIQUE (year, seamster_round, uni_id);


--
-- Name: courseset_subject uk_suj_real_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courseset_subject
    ADD CONSTRAINT uk_suj_real_id UNIQUE (suj_real_id, cr_id);


--
-- Name: user_detail uk_uid; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_detail
    ADD CONSTRAINT uk_uid UNIQUE (uid);


--
-- Name: user_detail uk_username; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_detail
    ADD CONSTRAINT uk_username UNIQUE (username);


--
-- Name: university_major uni_major; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.university_major
    ADD CONSTRAINT uni_major UNIQUE (fac_id, uni_id, major_id);


--
-- Name: university_detail university_detail_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.university_detail
    ADD CONSTRAINT university_detail_pkey PRIMARY KEY (uni_key);


--
-- Name: university_detail uq_uni_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.university_detail
    ADD CONSTRAINT uq_uni_id UNIQUE (uni_id);


--
-- Name: courseset_header fk_course_uni; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courseset_header
    ADD CONSTRAINT fk_course_uni FOREIGN KEY (cr_id, fac_id, uni_id) REFERENCES public.courseset_detail(cr_id, fac_id, uni_id);


--
-- Name: courseset_detail fk_cr_group_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courseset_detail
    ADD CONSTRAINT fk_cr_group_id FOREIGN KEY (cr_group_id) REFERENCES public.courseset_group(cr_group_id);


--
-- Name: course_seat fk_cr_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_seat
    ADD CONSTRAINT fk_cr_id FOREIGN KEY (cr_id) REFERENCES public.course_detail(cr_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: restrictgrp_subject fk_cr_restgrp_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restrictgrp_subject
    ADD CONSTRAINT fk_cr_restgrp_id FOREIGN KEY (cr_restgrp_id) REFERENCES public.courseset_restrictgrp(cr_restgrp_id);


--
-- Name: courseset_subject fk_cr_sub; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courseset_subject
    ADD CONSTRAINT fk_cr_sub FOREIGN KEY (fac_id, cr_id, uni_id, cr_head_id) REFERENCES public.courseset_header(fac_id, cr_id, uni_id, cr_head_id);


--
-- Name: university_major fk_fac_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.university_major
    ADD CONSTRAINT fk_fac_id FOREIGN KEY (fac_id, uni_id) REFERENCES public.university_faculty(fac_id, uni_id);


--
-- Name: plan_detail fk_folder_id_ref; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_detail
    ADD CONSTRAINT fk_folder_id_ref FOREIGN KEY ("ref_folder-plan_id") REFERENCES public.plan_detail(plan_id) ON UPDATE CASCADE;


--
-- Name: courseset_detail fk_maj_cr; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courseset_detail
    ADD CONSTRAINT fk_maj_cr FOREIGN KEY (uni_id, fac_id) REFERENCES public.university_faculty(uni_id, fac_id);


--
-- Name: place_room fk_place_key; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_room
    ADD CONSTRAINT fk_place_key FOREIGN KEY (uni_id, place_id) REFERENCES public.university_place(uni_id, place_id);


--
-- Name: university_faculty fk_place_key; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.university_faculty
    ADD CONSTRAINT fk_place_key FOREIGN KEY (uni_id, place_key) REFERENCES public.university_place(uni_id, place_id);


--
-- Name: university_major fk_place_key; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.university_major
    ADD CONSTRAINT fk_place_key FOREIGN KEY (uni_id, place_key) REFERENCES public.university_place(uni_id, place_id);


--
-- Name: restrictgrp_user fk_restgrp_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restrictgrp_user
    ADD CONSTRAINT fk_restgrp_id FOREIGN KEY (cr_restgrp_id) REFERENCES public.courseset_restrictgrp(cr_restgrp_id);


--
-- Name: course_detail fk_seamster; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_detail
    ADD CONSTRAINT fk_seamster FOREIGN KEY (year, semester, uni_id) REFERENCES public.seamster_detail(year, seamster_round, uni_id);


--
-- Name: seamster_rounding fk_seamster; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seamster_rounding
    ADD CONSTRAINT fk_seamster FOREIGN KEY (seamster_id) REFERENCES public.seamster_detail(seamster_id);


--
-- Name: plan_subject fk_stick_plan; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_subject
    ADD CONSTRAINT fk_stick_plan FOREIGN KEY (plan_id) REFERENCES public.plan_detail(plan_id);


--
-- Name: plan_subject fk_stick_subject; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_subject
    ADD CONSTRAINT fk_stick_subject FOREIGN KEY (year, seamster, code, sec, uni_id, suj_real_code) REFERENCES public.course_detail(year, semester, code, sec, uni_id, suj_real_code);


--
-- Name: user_additionrole fk_uid; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_additionrole
    ADD CONSTRAINT fk_uid FOREIGN KEY (uid) REFERENCES public.user_detail(uid);


--
-- Name: user_subjecthistory fk_uid; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subjecthistory
    ADD CONSTRAINT fk_uid FOREIGN KEY (uid) REFERENCES public.user_detail(uid);


--
-- Name: user_detail fk_uni; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_detail
    ADD CONSTRAINT fk_uni FOREIGN KEY (uni_id, fac_id, major_id) REFERENCES public.university_major(uni_id, fac_id, major_id);


--
-- Name: courseset_group fk_uni_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courseset_group
    ADD CONSTRAINT fk_uni_id FOREIGN KEY (uni_id) REFERENCES public.university_detail(uni_id);


--
-- Name: university_faculty fk_uni_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.university_faculty
    ADD CONSTRAINT fk_uni_id FOREIGN KEY (uni_id) REFERENCES public.university_detail(uni_id);


--
-- Name: subject_review uk_uniid; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_review
    ADD CONSTRAINT uk_uniid FOREIGN KEY (uni_id) REFERENCES public.university_detail(uni_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subject_review uk_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_review
    ADD CONSTRAINT uk_user FOREIGN KEY (uid) REFERENCES public.user_detail(uid) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: seamster_detail university_seamster_copy1_uni_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seamster_detail
    ADD CONSTRAINT university_seamster_copy1_uni_id_fkey FOREIGN KEY (uni_id) REFERENCES public.university_detail(uni_id);


--
-- PostgreSQL database dump complete
--


