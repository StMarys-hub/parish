-- St. Mary's Syro-Malabar Catholic Church - Seed Data
-- Run after 001_initial_schema.sql in the Supabase SQL Editor.

-- 1. Parish Info
INSERT INTO public.parish_info (
  id, parish_name, diocese_name, address_line, maps_url, phone, email, website_url,
  vicar_name, vicar_title, trustees, office_hours, general_notes
) VALUES (
  1,
  'St. Mary''s Syro-Malabar Catholic Church',
  'St. Thomas Syro-Malabar Catholic Diocese of Chicago',
  '715 E. Arrowood Rd, Charlotte, NC 28217',
  'https://maps.google.com/?q=715+E+Arrowood+Rd,+Charlotte,+NC+28217',
  '(813) 318-2186',
  'vicar@stmarysyroclt.org',
  'https://stmarysyroclt.org/',
  'Fr. Rajeev Valiyaveettil',
  'Parish Vicar',
  '[
    { "name": "Trustee 1 (Update in Admin)", "role": "Parish Trustee", "phone": "", "email": "" },
    { "name": "Trustee 2 (Update in Admin)", "role": "Parish Trustee", "phone": "", "email": "" }
  ]'::jsonb,
  'Tuesday – Friday: Before & after 7:00 PM Holy Qurbana, or by appointment with the Vicar.',
  'Confessions are available before Holy Qurbana or by appointment.'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Regular Recurring Schedules
INSERT INTO public.regular_schedules (sort_order, group_name, day_label, time_label, title, location, notes)
SELECT * FROM (VALUES
  (1, 'Sunday Holy Qurbana', 'Sundays', '8:00 AM', 'Holy Qurbana (Malayalam)', 'Main Church', NULL),
  (2, 'Sunday Holy Qurbana', 'Sundays', '9:30 AM', 'Adoration & Rosary', 'Main Church', NULL),
  (3, 'Sunday Holy Qurbana', 'Sundays', '10:00 AM', 'Holy Qurbana (English on 1st & 3rd Sundays / Malayalam)', 'Main Church', 'Timing updated to 10:00 AM starting June 7'),
  (4, 'Weekday Services', 'Tue – Fri', '6:30 PM', 'Rosary', 'Main Church', NULL),
  (5, 'Weekday Services', 'Tue – Fri', '7:00 PM', 'Holy Qurbana', 'Main Church', 'Wed: St. Joseph Novena • Thu/Fri: Adoration'),
  (6, 'Weekday Services', 'First Friday', '12:00 PM – 6:30 PM', 'Silent Adoration', 'Main Church', 'Followed by 6:30 PM Rosary & 7:00 PM Holy Qurbana'),
  (7, 'Weekday Services', 'Saturdays', '9:30 AM', 'Rosary', 'Main Church', NULL),
  (8, 'Weekday Services', 'Saturdays', '10:00 AM', 'Holy Qurbana & Novena of Mother of Perpetual Help', 'Main Church', NULL),
  (9, 'Outreach Missions (SC)', '1st Sunday', '4:30 PM', 'Holy Qurbana — Blythwood, SC', 'Transfiguration Catholic Church, Blythwood, SC', NULL),
  (10, 'Outreach Missions (SC)', '2nd Sunday', '5:00 PM', 'Holy Qurbana — Greer, SC', 'St. Rafka Maronite Catholic Church, Greer, SC', NULL)
) AS v(sort_order, group_name, day_label, time_label, title, location, notes)
WHERE NOT EXISTS (SELECT 1 FROM public.regular_schedules LIMIT 1);

-- 3. Sample Weekly Bulletin (06/01/2026 - 06/07/2026)
INSERT INTO public.weekly_bulletins (
  week_start, week_end, title, subtitle, greeting, daily_schedule, announcements, collection_summary, sign_off, status, published_at
) VALUES (
  '2026-06-01',
  '2026-06-07',
  'Weekly Schedule (06/01/2026 - 06/07/2026)',
  'Church Services & Parish Announcements',
  'Praise be to Jesus Christ, Now, Always, and Forever!',
  '[
    { "date": "2026-06-01", "dayLabel": "Monday", "feastNote": null, "items": [{ "time": "", "title": "No scheduled church services" }] },
    { "date": "2026-06-02", "dayLabel": "Tuesday", "feastNote": null, "items": [{ "time": "6:30 PM", "title": "Rosary" }, { "time": "7:00 PM", "title": "Holy Qurbana" }] },
    { "date": "2026-06-03", "dayLabel": "Wednesday", "feastNote": null, "items": [{ "time": "6:30 PM", "title": "Rosary" }, { "time": "7:00 PM", "title": "Holy Qurbana followed by St. Joseph Novena" }] },
    { "date": "2026-06-04", "dayLabel": "Thursday", "feastNote": "Feast of the Body and Blood of Christ", "items": [{ "time": "6:30 PM", "title": "Rosary" }, { "time": "7:00 PM", "title": "Holy Qurbana followed by Adoration" }] },
    { "date": "2026-06-05", "dayLabel": "First Friday", "feastNote": "First Friday Devotion", "items": [{ "time": "12:00 PM – 6:30 PM", "title": "Silent Adoration" }, { "time": "6:30 PM", "title": "Rosary" }, { "time": "7:00 PM", "title": "Holy Qurbana followed by Adoration" }] },
    { "date": "2026-06-06", "dayLabel": "Saturday", "feastNote": null, "items": [{ "time": "9:30 AM", "title": "Rosary" }, { "time": "10:00 AM", "title": "Holy Qurbana followed by Novena of Mother of Perpetual Help", "celebrant": "Fr. Rodolph Wakim" }] },
    { "date": "2026-06-07", "dayLabel": "Sunday", "feastNote": null, "items": [{ "time": "8:00 AM", "title": "Holy Qurbana", "celebrant": "Fr. Siby Sebastian" }, { "time": "9:30 AM", "title": "Adoration and Rosary" }, { "time": "10:00 AM", "title": "Holy Qurbana", "celebrant": "Fr. Siby Sebastian" }, { "time": "4:30 PM", "title": "Holy Qurbana at Transfiguration Catholic Church, Blythwood, SC" }] }
  ]'::jsonb,
  '[
    {
      "id": "ann-0601-1", "order": 1, "title": "Sunday Qurbana Time Change", "category": "Liturgical",
      "dateTimeLabel": "Beginning Sun, Jun 7", "locationLabel": "Main Church",
      "body": "Please note that beginning Sunday, June 7, the second Holy Qurbana will be celebrated at 10:00 AM.",
      "actions": []
    },
    {
      "id": "ann-0601-2", "order": 2, "title": "Summer Ministry Assignment", "category": "Parish Admin",
      "dateTimeLabel": "Throughout June", "locationLabel": null,
      "body": "Deacon Antony Kunnumpurath has begun his ministry with us and will be here throughout June. As he is also a medical doctor, he is willing to offer medical consultations during the month.",
      "actions": []
    },
    {
      "id": "ann-0601-3", "order": 3, "title": "Ward 3 Prayer Meeting", "category": "Ward Prayer",
      "dateTimeLabel": "Sat, Jun 6 • 7:00 PM", "locationLabel": "Residence of Sibi and Ligi (Ward 3)",
      "body": "Ward 3 will have a prayer meeting at 7:00 PM, hosted at the residence of Sibi and Ligi on Saturday, June 6.",
      "actions": []
    },
    {
      "id": "ann-0601-4", "order": 4, "title": "Fr. Siby''s Jubilee Celebration", "category": "Liturgical",
      "dateTimeLabel": "Sun, Jun 7 • After 10:00 AM Qurbana", "locationLabel": "Parish Hall",
      "body": "On Sunday, June 7, Fr. Siby will join us for Holy Qurbana as part of his jubilee year celebration. As we plan to provide lunch after the 10:00 AM Holy Qurbana, anyone interested in sponsoring the meal is kindly asked to contact Fr. Rajeev or one of the trustees.",
      "actions": []
    },
    {
      "id": "ann-0601-5", "order": 5, "title": "Graduation Holy Qurbana – June 14", "category": "Catechism/CCD",
      "dateTimeLabel": "Sun, Jun 14", "locationLabel": "Main Church",
      "body": "Our Baccalaureate Holy Qurbana will take place on June 14. During the Holy Qurbana, we will recognize all graduates, including high school, college, and higher studies graduates. Use the link below to participate in the Baccalaureate recognition.",
      "actions": [{ "label": "Baccalaureate Recognition Form", "kind": "form", "url": "https://docs.google.com/forms/d/1yHtsIUzpJjHzuruzuFT1ZL83h1Q4zzU3-w0ntcmpvZ0/edit" }]
    },
    {
      "id": "ann-0601-6", "order": 6, "title": "VBS Summer Program", "category": "Catechism/CCD",
      "dateTimeLabel": "Tue, Jun 16 – Thu, Jun 18", "locationLabel": "Parish Campus",
      "body": "Please mark your calendars for our Vacation Bible School program, happening from June 16–18. If you are able to volunteer to make VBS a fun event for our kids, please sign up using the volunteer form.",
      "actions": [{ "label": "VBS Volunteer Sign-Up Form", "kind": "form", "url": "https://docs.google.com/forms/d/e/1FAIpQLSeXLQRkam8I9M_S0eWyUygKyHebz3OzPIwl_gCtBGJyaRvejA/viewform?usp=publish-editor" }]
    },
    {
      "id": "ann-0601-7", "order": 7, "title": "Sunday Lunch Program", "category": "Parish Admin",
      "dateTimeLabel": "Next Year Sign-Up", "locationLabel": null,
      "body": "Here is the link to sign up for the Sunday lunch program for next year.",
      "actions": [{ "label": "Sunday Lunch Sign-Up Form", "kind": "form", "url": "https://docs.google.com/forms/d/1mukLEikLdzj8LGTdcj8sMab4l5Gli3mMwEtf_Fq1-v8/edit" }]
    },
    {
      "id": "ann-0601-8", "order": 8, "title": "CCD Day Video and Pictures", "category": "Catechism/CCD",
      "dateTimeLabel": null, "locationLabel": null,
      "body": "Please use the link below to view pictures and video from CCD Day.",
      "actions": [{ "label": "View CCD Day Photos & Video", "kind": "drive", "url": "https://drive.google.com/drive/folders/1tMkKXrVA1egU5_YZrfKpSM03615igfJZ" }]
    },
    {
      "id": "ann-0601-9", "order": 9, "title": "Summer Vocations Camps", "category": "Youth/Young Adults",
      "dateTimeLabel": "June", "locationLabel": "Belmont Abbey College",
      "body": "If you are planning to attend Quo Vadis Days, Duc in Altum, or Talitha Koum, please let Fr. Rajeev know so he can inform the Diocese of Charlotte Vocations Office. These camps and retreats for young men and women will take place in June at Belmont Abbey College and are focused on faith, prayer, vocation discernment, and fellowship.",
      "actions": []
    }
  ]'::jsonb,
  '{ "label": "Sunday Collection (May 24)", "amountDisplay": "$462.00" }'::jsonb,
  '{
    "closing": "With Prayers,",
    "name": "Fr. Rajeev Valiyaveettil",
    "title": "Vicar, St. Mary''s Syro Malabar Catholic Church",
    "email": "vicar@stmarysyroclt.org",
    "website": "https://stmarysyroclt.org/"
  }'::jsonb,
  'published',
  '2026-06-01T08:00:00Z'
)
ON CONFLICT (week_start) DO NOTHING;
