#!/usr/bin/env python3
"""
Blend-ed Discourse Community Seeder
------------------------------------
Creates realistic community users, categories, and threaded discussions
via the Discourse API. All content can be edited or deleted via UI or API.

Usage:
    python discourse_seed.py

Requirements:
    pip install requests python-dotenv

Setup:
    1. Set your DISCOURSE_URL and DISCOURSE_API_KEY below (or in .env)
    2. Run the script
    3. All created users/topics/posts are stored in created_content.json
       so you can track and delete them later if needed
"""

import requests
import json
import time
import random
import os
from datetime import datetime

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv optional; env vars can be set directly

# ─────────────────────────────────────────────
# CONFIGURATION — set via environment / .env
# Copy .env.example to .env and fill in values.
# ─────────────────────────────────────────────

DISCOURSE_URL = os.getenv("DISCOURSE_URL", "https://colab.blend-ed.com")
DISCOURSE_API_KEY = os.getenv("DISCOURSE_API_KEY", "")          # Admin → API → New key (global key)
DISCOURSE_API_USERNAME = os.getenv("DISCOURSE_API_USERNAME", "system")  # Your admin username

if not DISCOURSE_API_KEY:
    raise SystemExit(
        "DISCOURSE_API_KEY not set. Copy .env.example to .env and fill it in, "
        "or export DISCOURSE_API_KEY / DISCOURSE_URL / DISCOURSE_API_USERNAME."
    )

# Delay between API calls to avoid rate limiting (seconds)
POST_DELAY = 2
USER_DELAY = 1

# ─────────────────────────────────────────────
# USERS TO CREATE
# These are the personas from the seed content
# ─────────────────────────────────────────────

USERS = [
    {
        "name": "Gabriel Torres",
        "username": "gabriel_torres",
        "email": "gabriel.torres.lnd@mailnull.com",
        "password": "Discourse2024!Seed",
        "bio": "L&D Manager | 8 years in corporate training | Focused on completion rates and learner engagement",
    },
    {
        "name": "Aditya Sharma",
        "username": "aditya_sharma",
        "email": "aditya.sharma.lnd@mailnull.com",
        "password": "Discourse2024!Seed",
        "bio": "Training Consultant | Instructional design and content strategy",
    },
    {
        "name": "Ahmad Khalil",
        "username": "ahmad_khalil",
        "email": "ahmad.khalil.lnd@mailnull.com",
        "password": "Discourse2024!Seed",
        "bio": "Head of Learning Operations | Compliance and certification programs in regulated industries",
    },
    {
        "name": "Tessa Brennan",
        "username": "tessa_brennan",
        "email": "tessa.brennan.lnd@mailnull.com",
        "password": "Discourse2024!Seed",
        "bio": "eLearning Designer | Data-driven approach to course improvement",
    },
    {
        "name": "Aswini Nair",
        "username": "aswini_nair",
        "email": "aswini.nair.lnd@mailnull.com",
        "password": "Discourse2024!Seed",
        "bio": "Compliance Training Lead | Rebuilding our learning programs this year",
    },
    {
        "name": "Liza Petrova",
        "username": "liza_petrova",
        "email": "liza.petrova.lnd@mailnull.com",
        "password": "Discourse2024!Seed",
        "bio": "Digital Learning Manager | Exploring AI-assisted content development",
    },
    {
        "name": "Richard Okafor",
        "username": "richard_okafor",
        "email": "richard.okafor.lnd@mailnull.com",
        "password": "Discourse2024!Seed",
        "bio": "Learning Systems Architect | Regulated industries specialist | Functional safety and compliance",
    },
    {
        "name": "Adel Rahimi",
        "username": "adel_blendd",          # Blend-ed team member
        "email": "adel.rahimi.blendd@mailnull.com",
        "password": "Discourse2024!Seed",
        "bio": "GTM at Blend-ed | Previously ran L&D at a mid-size training company | Still think like a practitioner",
    },
    {
        "name": "Klara Novak",
        "username": "klara_novak",
        "email": "klara.novak.lnd@mailnull.com",
        "password": "Discourse2024!Seed",
        "bio": "Certification Programme Manager | Regulated training | Making audit prep less painful",
    },
    {
        "name": "Lydia Chen",
        "username": "lydia_chen",
        "email": "lydia.chen.lnd@mailnull.com",
        "password": "Discourse2024!Seed",
        "bio": "Learning & Development Coordinator | Building our certification infrastructure from scratch",
    },
]

# ─────────────────────────────────────────────
# CATEGORIES TO CREATE
# ─────────────────────────────────────────────

CATEGORIES = [
    {
        "name": "Industry Discussion",
        "color": "3358F2",
        "text_color": "FFFFFF",
        "description": "Practitioner conversations about L&D challenges across compliance, safety, healthcare, and professional training.",
        "slug": "industry-discussion",
    },
    {
        "name": "Course Design & Authoring",
        "color": "1B296D",
        "text_color": "FFFFFF",
        "description": "Discussions on instructional design, content structure, and authoring approaches.",
        "slug": "course-design",
    },
    {
        "name": "AI in Learning",
        "color": "0A1E73",
        "text_color": "FFFFFF",
        "description": "Real talk about using AI tools in training content creation and delivery.",
        "slug": "ai-in-learning",
    },
    {
        "name": "Compliance & Certification",
        "color": "2D6A4F",
        "text_color": "FFFFFF",
        "description": "Managing certification programs, audit readiness, and regulatory training requirements.",
        "slug": "compliance-certification",
    },
    {
        "name": "Platform Tips & Help",
        "color": "E9C46A",
        "text_color": "000000",
        "description": "Questions and tips for getting the most out of your LMS and training platform.",
        "slug": "platform-help",
    },
    {
        "name": "Show & Tell",
        "color": "E76F51",
        "text_color": "FFFFFF",
        "description": "Share courses, programs, or approaches you've built. No sales pitches — just ideas worth sharing.",
        "slug": "show-and-tell",
    },
]

# ─────────────────────────────────────────────
# THREADS — Discovery A, B, C from your content
# ─────────────────────────────────────────────

THREADS = [
    {
        "category_slug": "industry-discussion",
        "topic": {
            "username": "gabriel_torres",
            "title": "We keep losing people partway through our courses. What helped you?",
            "body": """Our completion rate sags in the middle of courses. Not the start, not the end. People get a few modules in and stop.

For anyone who has dealt with this, what actually moved it? Shorter modules, reminders, something else? Or is some of this just normal and not worth chasing?""",
        },
        "replies": [
            {
                "username": "aditya_sharma",
                "body": "We had the same. Cutting long modules into shorter ones helped us more than anything else. People finish a short one and stall on a long one. Not a magic fix but the numbers moved.",
                "delay": 3600,  # 1 hour later
            },
            {
                "username": "ahmad_khalil",
                "body": "For us it was less about the content and more about getting people back. They do not quit because the middle is dull, they leave, get busy, and never return. A reminder at the right time did more than reworking the course.",
                "delay": 7200,
            },
            {
                "username": "tessa_brennan",
                "body": "Worth checking where they actually drop before changing anything. We assumed it was length, looked at it, and it was one heavy module sitting too early. Moved it later and drop-off fell. Would have wasted time shortening everything otherwise.",
                "delay": 14400,
            },
            {
                "username": "aswini_nair",
                "body": "Reading this as we are rebuilding our courses this year. Does the same hold for compliance courses where people have to finish anyway? Curious if mandatory changes any of it.",
                "delay": 21600,
            },
            {
                "username": "gabriel_torres",
                "body": "Honestly our compliance completion is not much better than the optional stuff, which I do not fully understand. Thought have-to would sort it. Anyway, helpful, thanks.",
                "delay": 28800,
            },
        ],
    },
    {
        "category_slug": "ai-in-learning",
        "topic": {
            "username": "liza_petrova",
            "title": "Is AI-generated course content good enough to use as-is, or do you still edit it heavily?",
            "body": """Straight question. Is anyone using AI-built content as-is, or are you all still editing it a lot before it goes out? Trying to decide how much to trust it.""",
        },
        "replies": [
            {
                "username": "richard_okafor",
                "body": """Good enough for a first draft, not good enough to ship untouched, in our experience.

The writing is usually fine. What it gets wrong is the judgement — what to stress, what your audience already knows, the nuance. That is the part the expert is there for. So we let it draft and a person does the review. More risk if your content is regulated — a confident wrong line is worse than no line.""",
                "delay": 3600,
            },
            {
                "username": "ahmad_khalil",
                "body": "Agree. The draft is fast, the review is not. And the review needs someone who knows the subject, because the AI sounds right even when it is wrong. So it does not remove the expert, it moves them from writing to checking.",
                "delay": 7200,
            },
            {
                "username": "adel_blendd",
                "body": "Depends what the content has to do. For low-stakes internal stuff a light edit is fine. For anything someone gets certified on the bar is higher and untouched output will not clear it. The general good-enough-or-not question does not really have one answer.",
                "delay": 10800,
            },
            {
                "username": "aditya_sharma",
                "body": "This helps. We were treating it as trust it or do not. The 'draft it but always review it' framing is better. Saving this, thanks.",
                "delay": 14400,
            },
        ],
    },
    {
        "category_slug": "compliance-certification",
        "topic": {
            "username": "klara_novak",
            "title": "How do you keep certification records audit-ready without it eating all your time?",
            "body": """For the regulated folks here, how are you keeping certification and completion records audit-ready without someone spending half their week on it? Ours is too manual right now and it worries me.""",
        },
        "replies": [
            {
                "username": "richard_okafor",
                "body": """The thing that held up for us under audit was that the record builds itself as training happens, not afterwards. If you are putting spreadsheets together the week before an audit you have already lost.

What they wanted was specific — who completed what, on which version of the content, what date, what result. The bit that catches people out is content versioning — knowing which version someone was certified on. You cannot rebuild that later.""",
                "delay": 5400,
            },
            {
                "username": "ahmad_khalil",
                "body": "Two things saved us. Automate the chasing — the overdue and renewal reminders, that was eating the most time. And keep one source of truth. The moment records live in two places they drift, and the drift is what fails the audit.",
                "delay": 10800,
            },
            {
                "username": "lydia_chen",
                "body": "Reading this carefully as we are newer to running certifications. The versioning point is one I had not thought about. For a smaller team just setting up, is it best to get the automated tracking right from the start, or is there a simpler interim way that does not leave us exposed? Thank you in advance.",
                "delay": 18000,
            },
            {
                "username": "aswini_nair",
                "body": "Lydia, from one newer team to another, we are setting ours up now and the consistent advice seems to be do it properly from the start — the manual version is the bit you unpick later. My own question: how granular to make certifications without it becoming a sprawl that is hard to audit?",
                "delay": 21600,
            },
            {
                "username": "ahmad_khalil",
                "body": "Consolidated, for audit clarity. An auditor wants a clean line, not fifty near-identical certificates. Be specific only where a regulator actually needs the distinction.",
                "delay": 25200,
            },
        ],
    },
]

# ─────────────────────────────────────────────
# API HELPERS
# ─────────────────────────────────────────────

def api_headers(username=None):
    return {
        "Api-Key": DISCOURSE_API_KEY,
        "Api-Username": username or DISCOURSE_API_USERNAME,
        "Content-Type": "application/json",
    }

def api_get(path):
    r = requests.get(f"{DISCOURSE_URL}{path}", headers=api_headers())
    return r

def api_post(path, data, as_user=None):
    r = requests.post(
        f"{DISCOURSE_URL}{path}",
        headers=api_headers(as_user),
        json=data,
    )
    return r

def api_put(path, data, as_user=None):
    r = requests.put(
        f"{DISCOURSE_URL}{path}",
        headers=api_headers(as_user),
        json=data,
    )
    return r

# ─────────────────────────────────────────────
# STEP 1 — CREATE USERS
# ─────────────────────────────────────────────

def create_users():
    print("\n📋 STEP 1: Creating users...")
    created = []

    for user in USERS:
        print(f"  → Creating user: {user['username']}")
        r = api_post("/users.json", {
            "name": user["name"],
            "username": user["username"],
            "email": user["email"],
            "password": user["password"],
            "active": True,
            "approved": True,
        })

        if r.status_code in [200, 201]:
            data = r.json()
            user_id = data.get("user", {}).get("id") or data.get("id")
            print(f"     ✅ Created (id: {user_id})")
            created.append({"username": user["username"], "id": user_id})

            # Set bio via user update
            if user.get("bio") and user_id:
                time.sleep(USER_DELAY)
                api_put(f"/u/{user['username']}.json", {
                    "bio_raw": user["bio"],
                    "username": user["username"],
                })
        else:
            err = r.json()
            if "errors" in err and any("taken" in str(e).lower() for e in err.get("errors", [])):
                print(f"     ⚠️  Already exists, skipping")
                created.append({"username": user["username"], "id": None})
            else:
                print(f"     ❌ Failed: {r.status_code} — {r.text[:200]}")

        time.sleep(USER_DELAY)

    return created

# ─────────────────────────────────────────────
# STEP 2 — CREATE CATEGORIES
# ─────────────────────────────────────────────

def create_categories():
    print("\n📁 STEP 2: Creating categories...")
    created = {}

    # Fetch existing categories first
    r = api_get("/categories.json")
    existing = {}
    if r.status_code == 200:
        for cat in r.json().get("category_list", {}).get("categories", []):
            existing[cat["slug"]] = cat["id"]

    for cat in CATEGORIES:
        slug = cat["slug"]
        if slug in existing:
            print(f"  ⚠️  Category '{cat['name']}' already exists (id: {existing[slug]}), using it")
            created[slug] = existing[slug]
            continue

        print(f"  → Creating category: {cat['name']}")
        r = api_post("/categories.json", {
            "name": cat["name"],
            "color": cat["color"],
            "text_color": cat["text_color"],
            "slug": slug,
        })

        if r.status_code in [200, 201]:
            cat_id = r.json().get("category", {}).get("id")
            print(f"     ✅ Created (id: {cat_id})")
            created[slug] = cat_id
        else:
            print(f"     ❌ Failed: {r.status_code} — {r.text[:200]}")

        time.sleep(USER_DELAY)

    return created

# ─────────────────────────────────────────────
# STEP 3 — CREATE THREADS + REPLIES
# ─────────────────────────────────────────────

def create_threads(categories):
    print("\n💬 STEP 3: Creating threads and replies...")
    created_topics = []

    for thread in THREADS:
        cat_slug = thread["category_slug"]
        cat_id = categories.get(cat_slug)

        if not cat_id:
            print(f"  ❌ Category '{cat_slug}' not found, skipping thread")
            continue

        topic_data = thread["topic"]
        print(f"\n  → Posting topic: \"{topic_data['title']}\"")
        print(f"     as: {topic_data['username']} in #{cat_slug}")

        r = api_post("/posts.json", {
            "title": topic_data["title"],
            "raw": topic_data["body"],
            "category": cat_id,
        }, as_user=topic_data["username"])

        if r.status_code not in [200, 201]:
            print(f"     ❌ Failed: {r.status_code} — {r.text[:300]}")
            continue

        result = r.json()
        topic_id = result.get("topic_id")
        post_id = result.get("id")
        print(f"     ✅ Topic created (topic_id: {topic_id}, post_id: {post_id})")

        created_topics.append({
            "title": topic_data["title"],
            "topic_id": topic_id,
            "post_id": post_id,
            "category": cat_slug,
            "replies": [],
        })

        # Post replies
        for reply in thread.get("replies", []):
            time.sleep(POST_DELAY)
            print(f"     ↳ Reply from {reply['username']}")

            rr = api_post("/posts.json", {
                "topic_id": topic_id,
                "raw": reply["body"],
            }, as_user=reply["username"])

            if rr.status_code in [200, 201]:
                reply_id = rr.json().get("id")
                print(f"       ✅ Reply posted (post_id: {reply_id})")
                created_topics[-1]["replies"].append({
                    "username": reply["username"],
                    "post_id": reply_id,
                })
            else:
                print(f"       ❌ Reply failed: {rr.status_code} — {rr.text[:200]}")

        time.sleep(POST_DELAY)

    return created_topics

# ─────────────────────────────────────────────
# STEP 4 — SAVE CREATED CONTENT LOG
# ─────────────────────────────────────────────

def save_log(users, categories, topics):
    log = {
        "created_at": datetime.now().isoformat(),
        "discourse_url": DISCOURSE_URL,
        "users": users,
        "categories": categories,
        "topics": topics,
        "note": "All topics and posts can be edited/deleted from the Discourse admin UI or via DELETE /posts/{id}.json API"
    }
    with open("created_content.json", "w") as f:
        json.dump(log, f, indent=2)
    print("\n📄 Log saved to created_content.json")

# ─────────────────────────────────────────────
# OPTIONAL: DELETE EVERYTHING (run separately)
# ─────────────────────────────────────────────

def delete_all_seeded_content():
    """
    Run this separately if you want to clean up everything.
    Reads from created_content.json and deletes all posts, topics, users.
    """
    if not os.path.exists("created_content.json"):
        print("❌ created_content.json not found. Nothing to delete.")
        return

    with open("created_content.json") as f:
        log = json.load(f)

    print("\n🗑️  DELETING all seeded content...")

    # Delete posts (replies first, then topic posts)
    for topic in log.get("topics", []):
        for reply in topic.get("replies", []):
            pid = reply.get("post_id")
            if pid:
                r = requests.delete(
                    f"{log['discourse_url']}/posts/{pid}.json",
                    headers=api_headers(),
                    json={"context": "Seed cleanup"}
                )
                print(f"  🗑️  Deleted post {pid}: {r.status_code}")
                time.sleep(1)

        # Delete topic opening post
        pid = topic.get("post_id")
        if pid:
            r = requests.delete(
                f"{log['discourse_url']}/posts/{pid}.json",
                headers=api_headers(),
                json={"context": "Seed cleanup"}
            )
            print(f"  🗑️  Deleted topic post {pid}: {r.status_code}")
            time.sleep(1)

    # Delete users (anonymize via admin)
    for user in log.get("users", []):
        uname = user.get("username")
        if uname:
            r = requests.delete(
                f"{log['discourse_url']}/admin/users/{uname}.json",
                headers=api_headers(),
                json={"delete_posts": True, "block_email": False}
            )
            print(f"  🗑️  Deleted user {uname}: {r.status_code}")
            time.sleep(1)

    print("\n✅ Cleanup complete.")

# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 55)
    print("  Blend-ed Discourse Community Seeder")
    print("=" * 55)
    print(f"  Target: {DISCOURSE_URL}")
    print(f"  Users to create: {len(USERS)}")
    print(f"  Categories: {len(CATEGORIES)}")
    print(f"  Threads: {len(THREADS)}")
    print("=" * 55)

    # Uncomment to DELETE instead of create:
    # delete_all_seeded_content()
    # exit()

    users = create_users()
    categories = create_categories()
    topics = create_threads(categories)
    save_log(users, categories, topics)

    print("\n✅ Seeding complete!")
    print(f"   {len(users)} users | {len(categories)} categories | {len(topics)} threads")
    print("\nNext steps:")
    print("  1. Check your Discourse forum — content should be live")
    print("  2. Edit any post via Admin or directly from the post UI")
    print("  3. To delete everything: uncomment delete_all_seeded_content() and re-run")
