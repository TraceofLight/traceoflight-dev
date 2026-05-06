--
-- PostgreSQL database dump
--


-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: asset_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.asset_kind AS ENUM (
    'image',
    'video',
    'file'
);


--
-- Name: post_comment_author_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.post_comment_author_type AS ENUM (
    'guest',
    'admin'
);


--
-- Name: post_comment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.post_comment_status AS ENUM (
    'active',
    'deleted'
);


--
-- Name: post_comment_visibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.post_comment_visibility AS ENUM (
    'public',
    'private'
);


--
-- Name: post_content_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.post_content_kind AS ENUM (
    'blog',
    'project'
);


--
-- Name: post_locale; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.post_locale AS ENUM (
    'ko',
    'en',
    'ja',
    'zh'
);


--
-- Name: post_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.post_status AS ENUM (
    'draft',
    'published',
    'archived'
);


--
-- Name: post_top_media_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.post_top_media_kind AS ENUM (
    'image',
    'youtube',
    'video'
);


--
-- Name: post_translation_source_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.post_translation_source_kind AS ENUM (
    'manual',
    'machine'
);


--
-- Name: post_translation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.post_translation_status AS ENUM (
    'source',
    'synced',
    'stale',
    'failed'
);


--
-- Name: post_visibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.post_visibility AS ENUM (
    'public',
    'private'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_credentials (
    key character varying(40) NOT NULL,
    login_id character varying(120) NOT NULL,
    password_hash character varying(255) NOT NULL,
    credential_revision integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: media_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_assets (
    id uuid NOT NULL,
    kind public.asset_kind NOT NULL,
    bucket character varying(100) NOT NULL,
    object_key character varying(512) NOT NULL,
    original_filename character varying(255) NOT NULL,
    mime_type character varying(120) NOT NULL,
    size_bytes bigint DEFAULT '0'::bigint NOT NULL,
    width integer,
    height integer,
    duration_seconds integer,
    owner_post_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: post_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_comments (
    post_id uuid NOT NULL,
    root_comment_id uuid,
    reply_to_comment_id uuid,
    author_name character varying(80) NOT NULL,
    author_type public.post_comment_author_type NOT NULL,
    password_hash character varying(255),
    visibility public.post_comment_visibility NOT NULL,
    status public.post_comment_status NOT NULL,
    body text NOT NULL,
    deleted_at timestamp with time zone,
    last_edited_at timestamp with time zone,
    request_ip_hash character varying(128),
    user_agent_hash character varying(128),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid NOT NULL
);


--
-- Name: post_slug_redirects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_slug_redirects (
    id uuid NOT NULL,
    locale public.post_locale NOT NULL,
    old_slug character varying(160) NOT NULL,
    target_post_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_hit_at timestamp with time zone,
    hit_count integer DEFAULT 0 NOT NULL
);


--
-- Name: post_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_tags (
    post_id uuid NOT NULL,
    tag_id uuid NOT NULL
);


--
-- Name: posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posts (
    id uuid NOT NULL,
    slug character varying(160) NOT NULL,
    title character varying(200) NOT NULL,
    excerpt character varying(400),
    body_markdown text NOT NULL,
    cover_image_url character varying(500),
    status public.post_status DEFAULT 'draft'::public.post_status NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    visibility public.post_visibility NOT NULL,
    series_title character varying(200),
    content_kind public.post_content_kind NOT NULL,
    top_media_kind public.post_top_media_kind NOT NULL,
    top_media_image_url character varying(500),
    top_media_youtube_url character varying(500),
    top_media_video_url character varying(500),
    project_order_index integer,
    locale public.post_locale NOT NULL,
    translation_group_id uuid NOT NULL,
    source_post_id uuid,
    translation_status public.post_translation_status NOT NULL,
    translation_source_kind public.post_translation_source_kind NOT NULL,
    translated_from_hash character varying(64)
);


--
-- Name: project_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_profiles (
    id uuid NOT NULL,
    post_id uuid NOT NULL,
    period_label character varying(120) NOT NULL,
    role_summary character varying(240) NOT NULL,
    card_image_url character varying(500),
    highlights_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    resource_links_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    project_intro text
);


--
-- Name: series; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.series (
    id uuid NOT NULL,
    slug character varying(160) NOT NULL,
    title character varying(200) NOT NULL,
    description text NOT NULL,
    cover_image_url character varying(500),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    list_order_index integer,
    locale public.post_locale NOT NULL,
    translation_group_id uuid NOT NULL,
    source_series_id uuid,
    translation_status public.post_translation_status NOT NULL,
    translation_source_kind public.post_translation_source_kind NOT NULL,
    translated_from_hash character varying(64)
);


--
-- Name: series_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.series_posts (
    id uuid NOT NULL,
    series_id uuid NOT NULL,
    post_id uuid NOT NULL,
    order_index integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: series_slug_redirects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.series_slug_redirects (
    id uuid NOT NULL,
    locale public.post_locale NOT NULL,
    old_slug character varying(160) NOT NULL,
    target_series_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_hit_at timestamp with time zone,
    hit_count integer DEFAULT 0 NOT NULL
);


--
-- Name: site_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_profiles (
    key character varying(40) NOT NULL,
    email character varying(255) NOT NULL,
    github_url character varying(500) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid NOT NULL,
    slug character varying(80) NOT NULL,
    label character varying(80) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_credentials admin_credentials_login_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_credentials
    ADD CONSTRAINT admin_credentials_login_id_key UNIQUE (login_id);


--
-- Name: admin_credentials admin_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_credentials
    ADD CONSTRAINT admin_credentials_pkey PRIMARY KEY (key);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: media_assets media_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_pkey PRIMARY KEY (id);


--
-- Name: post_comments post_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_pkey PRIMARY KEY (id);


--
-- Name: post_slug_redirects post_slug_redirects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_slug_redirects
    ADD CONSTRAINT post_slug_redirects_pkey PRIMARY KEY (id);


--
-- Name: post_tags post_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_tags
    ADD CONSTRAINT post_tags_pkey PRIMARY KEY (post_id, tag_id);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: project_profiles project_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_profiles
    ADD CONSTRAINT project_profiles_pkey PRIMARY KEY (id);


--
-- Name: series series_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.series
    ADD CONSTRAINT series_pkey PRIMARY KEY (id);


--
-- Name: series_posts series_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.series_posts
    ADD CONSTRAINT series_posts_pkey PRIMARY KEY (id);


--
-- Name: series_slug_redirects series_slug_redirects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.series_slug_redirects
    ADD CONSTRAINT series_slug_redirects_pkey PRIMARY KEY (id);


--
-- Name: site_profiles site_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_profiles
    ADD CONSTRAINT site_profiles_pkey PRIMARY KEY (key);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: post_slug_redirects uq_post_slug_redirects_locale_old_slug; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_slug_redirects
    ADD CONSTRAINT uq_post_slug_redirects_locale_old_slug UNIQUE (locale, old_slug);


--
-- Name: posts uq_posts_slug_locale; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT uq_posts_slug_locale UNIQUE (slug, locale);


--
-- Name: project_profiles uq_project_profiles_post_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_profiles
    ADD CONSTRAINT uq_project_profiles_post_id UNIQUE (post_id);


--
-- Name: series_posts uq_series_posts_post_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.series_posts
    ADD CONSTRAINT uq_series_posts_post_id UNIQUE (post_id);


--
-- Name: series_posts uq_series_posts_series_order; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.series_posts
    ADD CONSTRAINT uq_series_posts_series_order UNIQUE (series_id, order_index);


--
-- Name: series uq_series_slug_locale; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.series
    ADD CONSTRAINT uq_series_slug_locale UNIQUE (slug, locale);


--
-- Name: series_slug_redirects uq_series_slug_redirects_locale_old_slug; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.series_slug_redirects
    ADD CONSTRAINT uq_series_slug_redirects_locale_old_slug UNIQUE (locale, old_slug);


--
-- Name: ix_media_assets_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_media_assets_kind ON public.media_assets USING btree (kind);


--
-- Name: ix_media_assets_object_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_media_assets_object_key ON public.media_assets USING btree (object_key);


--
-- Name: ix_post_comments_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_post_comments_post_id ON public.post_comments USING btree (post_id);


--
-- Name: ix_post_comments_reply_to_comment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_post_comments_reply_to_comment_id ON public.post_comments USING btree (reply_to_comment_id);


--
-- Name: ix_post_comments_root_comment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_post_comments_root_comment_id ON public.post_comments USING btree (root_comment_id);


--
-- Name: ix_post_comments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_post_comments_status ON public.post_comments USING btree (status);


--
-- Name: ix_post_comments_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_post_comments_visibility ON public.post_comments USING btree (visibility);


--
-- Name: ix_post_slug_redirects_target_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_post_slug_redirects_target_post_id ON public.post_slug_redirects USING btree (target_post_id);


--
-- Name: ix_post_tags_tag_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_post_tags_tag_id ON public.post_tags USING btree (tag_id);


--
-- Name: ix_posts_content_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_posts_content_kind ON public.posts USING btree (content_kind);


--
-- Name: ix_posts_locale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_posts_locale ON public.posts USING btree (locale);


--
-- Name: ix_posts_project_order_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_posts_project_order_index ON public.posts USING btree (project_order_index);


--
-- Name: ix_posts_series_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_posts_series_title ON public.posts USING btree (series_title);


--
-- Name: ix_posts_source_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_posts_source_post_id ON public.posts USING btree (source_post_id);


--
-- Name: ix_posts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_posts_status ON public.posts USING btree (status);


--
-- Name: ix_posts_translation_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_posts_translation_group_id ON public.posts USING btree (translation_group_id);


--
-- Name: ix_posts_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_posts_visibility ON public.posts USING btree (visibility);


--
-- Name: ix_project_profiles_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_project_profiles_post_id ON public.project_profiles USING btree (post_id);


--
-- Name: ix_series_list_order_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_series_list_order_index ON public.series USING btree (list_order_index);


--
-- Name: ix_series_locale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_series_locale ON public.series USING btree (locale);


--
-- Name: ix_series_posts_series_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_series_posts_series_id ON public.series_posts USING btree (series_id);


--
-- Name: ix_series_slug_redirects_target_series_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_series_slug_redirects_target_series_id ON public.series_slug_redirects USING btree (target_series_id);


--
-- Name: ix_series_source_series_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_series_source_series_id ON public.series USING btree (source_series_id);


--
-- Name: ix_series_translation_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_series_translation_group_id ON public.series USING btree (translation_group_id);


--
-- Name: ix_tags_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_tags_slug ON public.tags USING btree (slug);


--
-- Name: post_slug_redirects fk_post_slug_redirects_target_post_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_slug_redirects
    ADD CONSTRAINT fk_post_slug_redirects_target_post_id FOREIGN KEY (target_post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: posts fk_posts_source_post_id_posts; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT fk_posts_source_post_id_posts FOREIGN KEY (source_post_id) REFERENCES public.posts(id) ON DELETE SET NULL;


--
-- Name: series_slug_redirects fk_series_slug_redirects_target_series_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.series_slug_redirects
    ADD CONSTRAINT fk_series_slug_redirects_target_series_id FOREIGN KEY (target_series_id) REFERENCES public.series(id) ON DELETE CASCADE;


--
-- Name: series fk_series_source_series_id_series; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.series
    ADD CONSTRAINT fk_series_source_series_id_series FOREIGN KEY (source_series_id) REFERENCES public.series(id) ON DELETE SET NULL;


--
-- Name: media_assets media_assets_owner_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_owner_post_id_fkey FOREIGN KEY (owner_post_id) REFERENCES public.posts(id) ON DELETE SET NULL;


--
-- Name: post_comments post_comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_comments post_comments_reply_to_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_reply_to_comment_id_fkey FOREIGN KEY (reply_to_comment_id) REFERENCES public.post_comments(id) ON DELETE CASCADE;


--
-- Name: post_comments post_comments_root_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_root_comment_id_fkey FOREIGN KEY (root_comment_id) REFERENCES public.post_comments(id) ON DELETE CASCADE;


--
-- Name: post_tags post_tags_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_tags
    ADD CONSTRAINT post_tags_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_tags post_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_tags
    ADD CONSTRAINT post_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id);


--
-- Name: project_profiles project_profiles_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_profiles
    ADD CONSTRAINT project_profiles_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: series_posts series_posts_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.series_posts
    ADD CONSTRAINT series_posts_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: series_posts series_posts_series_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.series_posts
    ADD CONSTRAINT series_posts_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.series(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


