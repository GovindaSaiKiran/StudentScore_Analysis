import os
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import engine, Base, get_db

from app.api.api_routes import router

# Create database tables
Base.metadata.create_all(bind=engine)

# Create FastAPI app
app = FastAPI(
    title=get_settings().app_name,
    version=get_settings().app_version,
    description="EduDrishti + LearnPulse: Student Learning Intelligence & Parent Accessibility Platform",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router, prefix="")

# Mount static files for frontend if directory exists
static_dir = os.path.join(os.path.dirname(__file__), "frontend", "build")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir, html=True), name="static")


@app.get("/")
async def root():
    """Root endpoint returning app info."""
    return {
        "name": get_settings().app_name,
        "version": get_settings().app_version,
        "status": "running",
        "docs": "/api/docs",
    }


@app.get("/api/health")
async def api_health():
    """API health check."""
    return {
        "status": "healthy",
        "version": get_settings().app_version,
    }


# Database initialization endpoint
@app.post("/admin/init-db")
async def initialize_database():
    """Initialize database with tables."""
    try:
        Base.metadata.create_all(bind=engine)
        return {"status": "database_initialized", "message": "All tables created successfully"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# Demo data initialization
@app.post("/admin/init-demo-data")
async def initialize_demo_data(db: Session = Depends(get_db)):
    """Initialize demo data for evaluation."""
    from app.models.models import (
        User,
        Student,
        Subject,
        Topic,
        Assessment,
        AssessmentResult,
        QuizAttempt,
        StudySession,
        AttendanceRecord,
        AssignmentRecord,
        TeacherFeedback,
        ParentChild,
    )
    from passlib.context import CryptContext
    import pandas as pd
    import numpy as np

    pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

    # Create admin user
    admin_user = User(
        email="admin@edudrishti.test",
        hashed_password=pwd_ctx.hash("admin123"),
        full_name="System Administrator",
        role="admin",
        language="en",
        is_active=True,
    )

    # Create demo parent user
    parent_user = User(
        email="parent@edudrishti.test",
        hashed_password=pwd_ctx.hash("parent123"),
        full_name="Demo Parent",
        role="parent",
        language="en",
        is_active=True,
    )

    # Create demo student user
    student_user = User(
        email="student@edudrishti.test",
        hashed_password=pwd_ctx.hash("student123"),
        full_name="Demo Student",
        role="student",
        language="en",
        is_active=True,
    )

    db.add_all([admin_user, parent_user, student_user])
    db.commit()
    db.refresh(admin_user)
    db.refresh(parent_user)
    db.refresh(student_user)

    # Create student record
    demo_student = Student(
        user_id=student_user.id,
        student_code="EDU001",
        first_name="Aarav",
        last_name="Patel",
        date_of_birth="2015-06-15",
        grade="5",
        section="A",
        school_name="Brightwood International School",
        avatar_url="/api/placeholder/100/100",
    )
    db.add(demo_student)
    db.commit()
    db.refresh(demo_student)

    # Create parent-child relationship
    parent_child = ParentChild(
        parent_id=parent_user.id,
        student_id=demo_student.id,
        relationship="parent",
    )
    db.add(parent_child)
    db.commit()

    # Create subjects
    math = Subject(name="Mathematics", code="MATH", color="#3B82F6")
    science = Subject(name="Science", code="SCI", color="#10B981")
    english = Subject(name="English", code="ENG", color="#F59E0B")
    social = Subject(name="Social Studies", code="SS", color="#8B5CF6")

    db.add_all([math, science, english, social])
    db.commit()

    # Create topics for Mathematics
    math_topics = [
        Topic(subject_id=math.id, name="Fractions", description="Understanding fractions and their operations", order_index=1),
        Topic(subject_id=math.id, name="Percentages", description="Working with percentages and percentage changes", order_index=2),
        Topic(subject_id=math.id, name="Algebra", description="Basic algebraic expressions and equations", order_index=3),
        Topic(subject_id=math.id, name="Geometry", description "Basic geometric shapes and calculations", order_index=4),
    ]
    db.add_all(math_topics)
    db.commit()

    # Create topics for Science
    science_topics = [
        Topic(subject_id=science.id, name="Electricity", description="Understanding electric circuits and properties", order_index=1),
        Topic(subject_id=science.id, name="Force and Motion", description="Studying force, motion, and acceleration", order_index=2),
        Topic(subject_id=science.id, name="Cells and Systems", description="Learning about plant and animal cells", order_index=3),
    ]
    db.add_all(science_topics)
    db.commit()

    # Create topics for English
    english_topics = [
        Topic(subject_id=english.id, name="Reading Comprehension", description="Reading and understanding text", order_index=1),
        Topic(subject_id=english.id, name="Grammar", description="Parts of speech and sentence structure", order_index=2),
        Topic(subject_id=english.id, name="Creative Writing", description="Writing stories and essays", order_index=3),
    ]
    db.add_all(english_topics)
    db.commit()

    # Create assessments
    assessments = [
        Assessment(
            subject_id=math.id,
            name="Quarterly Math Assessment",
            assessment_type="exam",
            max_marks=100,
            weight=1.0,
            assessment_date="2024-01-15",
            description="Quarterly mathematics assessment covering all topics",
        ),
        Assessment(
            subject_id=math.id,
            name="Fractions Quiz 1",
            assessment_type="quiz",
            max_marks=20,
            weight=0.5,
            assessment_date="2024-01-20",
            description="Quiz on fractions - basic operations",
        ),
        Assessment(
            subject_id=math.id,
            name="Fractions Quiz 2",
            assessment_type="quiz",
            max_marks=20,
            weight=0.5,
            assessment_date="2024-02-10",
            description="Quiz on fractions - advanced operations",
        ),
        Assessment(
            subject_id=math.id,
            name="Percentages Test",
            assessment_type="exam",
            max_marks=50,
            weight=1.0,
            assessment_date="2024-03-01",
            description="Test on percentages and percentage changes",
        ),
        Assessment(
            subject_id=science.id,
            name="Science Quiz - Electricity",
            assessment_type="quiz",
            max_marks=30,
            weight=0.5,
            assessment_date="2024-01-25",
            description="Quiz on electricity and circuits",
        ),
        Assessment(
            subject_id=science.id,
            name="Force and Motion Exam",
            assessment_type="exam",
            max_marks=50,
            weight=1.0,
            assessment_date="2024-03-15",
            description "Exam on force, motion, and acceleration",
        ),
        Assessment(
            subject_id=english.id,
            name="Reading Comprehension Quiz",
            assessment_type="quiz",
            max_marks=25,
            weight=0.5,
            assessment_date="2024-01-18",
            description="Quiz on reading comprehension skills",
        ),
        Assessment(
            subject_id=english.id,
            name="Creative Writing Assignment",
            assessment_type="assignment",
            max_marks=50,
            weight=1.0,
            assessment_date="2024-02-20",
            description="Creative writing assignment - story writing",
        ),
    ]
    db.add_all(assessments)
    db.commit()

    # Create assessment results (mixed trends: improving, stable, declining)
    assessment_results = [
        # Aarav's results
        AssessmentResult(
            student_id=demo_student.id,
            assessment_id=assessments[0].id,  # Quarterly Math
            marks_obtained=54,
            percentage=54.0,
            remarks="Needs improvement in algebra",
        ),
        AssessmentResult(
            student_id=demo_student.id,
            assessment_id=assessments[1].id,  # Fractions Quiz 1
            marks_obtained=16,
            percentage=80.0,  # 16/20 = 80%
            remarks="Good start with basic fractions",
        ),
        AssessmentResult(
            student_id=demo_student.id,
            assessment_id=assessments[2].id,  # Fractions Quiz 2
            marks_obtained=14,
            percentage=70.0,  # 14/20 = 70%
            remarks="Improving but still mistakes",
        ),
        AssessmentResult(
            student_id=demo_student.id,
            assessment_id=assessments[3].id,  # Percentages Test
            marks_obtained=35,
            percentage=70.0,  # 35/50 = 70%
            remarks="Understanding percentages well",
        ),
        AssessmentResult(
            student_id=demo_student.id,
            assessment_id=assessments[4].id,  # Science Quiz Electricity
            marks_obtained=20,
            percentage=66.7,  # 20/30 = 66.7%
            remarks="Basic concepts understood",
        ),
        AssessmentResult(
            student_id=demo_student.id,
            assessment_id=assessments[5].id,  # Force and Motion Exam
            marks_obtained=32,
            percentage=64.0,  # 32/50 = 64%
            remarks="Improving understanding",
        ),
        AssessmentResult(
            student_id=demo_student.id,
            assessment_id=assessments[6].id,  # Reading Comprehension Quiz
            marks_obtained=20,
            percentage=80.0,  # 20/25 = 80%
            remarks="Strong reading skills",
        ),
        AssessmentResult(
            student_id=demo_student.id,
            assessment_id=assessments[7].id,  # Creative Writing Assignment
            marks_obtained=40,
            percentage=80.0,  # 40/50 = 80%
            remarks="Creative and well-structured",
        ),
    ]
    db.add_all(assessment_results)
    db.commit()

    # Create quiz attempts (before and after practice)
    quiz_attempts = [
        # Before practice
        QuizAttempt(
            student_id=demo_student.id,
            subject_id=math.id,
            topic_id=1,  # Fractions
            assessment_id=assessments[1].id,
            score=16,
            max_score=20,
            percentage=80.0,
            attempt_date="2024-01-20",
            notes="Initial fractions quiz",
        ),
        QuizAttempt(
            student_id=demo_student.id,
            subject_id=math.id,
            topic_id=1,  # Fractions
            assessment_id=assessments[2].id,
            score=14,
            max_score=20,
            percentage=70.0,
            attempt_date="2024-02-10",
            notes="After some practice",
        ),
        # After practice - improved
        QuizAttempt(
            student_id=demo_student.id,
            subject_id=math.id,
            topic_id=1,  # Fractions
            assessment_id=None,
            score=18,
            max_score=20,
            percentage=90.0,
            attempt_date="2024-03-15",
            notes="After targeted practice session",
        ),
        # Science topic attempts
        QuizAttempt(
            student_id=demo_student.id,
            subject_id=science.id,
            topic_id=1,  # Electricity
            assessment_id=assessments[4].id,
            score=20,
            max_score=30,
            percentage=66.7,
            attempt_date="2024-01-25",
            notes="Initial electricity quiz",
        ),
        QuizAttempt(
            student_id=demo_student.id,
            subject_id=science.id,
            topic_id=1,  # Electricity
            assessment_id=None,
            score=25,
            max_score=30,
            percentage=83.3,
            attempt_date="2024-03-20",
            notes="After revision session",
        ),
        # English topic attempts
        QuizAttempt(
            student_id=demo_student.id,
            subject_id=english.id,
            topic_id=1,  # Reading Comprehension
            assessment_id=assessments[6].id,
            score=20,
            max_score=25,
            percentage=80.0,
            attempt_date="2024-01-18",
            notes="Initial reading quiz",
        ),
        QuizAttempt(
            student_id=demo_student.id,
            subject_id=english.id,
            topic_id=1,  # Reading Comprehension
            assessment_id=None,
            score=22,
            max_score=25,
            percentage=88.0,
            attempt_date="2024-02-15",
            notes="After practice",
        ),
    ]
    db.add_all(quiz_attempts)
    db.commit()

    # Create study sessions
    study_sessions = [
        StudySession(
            student_id=demo_student.id,
            subject_id=math.id,
            topic_id=1,  # Fractions
            activity_type="revision",
            duration_minutes=45,
            session_date="2024-02-05",
            notes="Reviewed fractions concepts and practiced problems",
            quiz_score=14,
            quiz_max_score=20,
        ),
        StudySession(
            student_id=demo_student.id,
            subject_id=math.id,
            topic_id=1,  # Fractions
            activity_type="practice",
            duration_minutes=60,
            session_date="2024-03-10",
            notes="Practiced advanced fraction operations",
            quiz_score=18,
            quiz_max_score=20,
        ),
        StudySession(
            student_id=demo_student.id,
            subject_id=science.id,
            topic_id=1,  # Electricity
            activity_type="study",
            duration_minutes=30,
            session_date="2024-03-12",
            notes="Studied electric circuits and properties",
            quiz_score=25,
            quiz_max_score=30,
        ),
        StudySession(
            student_id=demo_student.id,
            subject_id=english.id,
            topic_id=1,  # Reading Comprehension
            activity_type="revision",
            duration_minutes=40,
            session_date="2024-02-10",
            notes="Reviewed reading comprehension strategies",
            quiz_score=22,
            quiz_max_score=25,
        ),
    ]
    db.add_all(study_sessions)
    db.commit()

    # Create attendance records ( mixed attendance )
    attendance_records = [
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-01-02",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-01-03",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-01-04",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-01-05",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-01-06",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-01-09",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-01-10",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-01-11",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-01-12",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-01-16",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-01-17",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-01-18",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-01-19",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-01-23",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-01-24",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-01-25",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-01-26",
            status="late",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-01-27",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-01-30",
            status="present",
        ),
        # Some absences
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-02-01",
            status="absent",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-02-03",
            status="absent",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-02-05",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-02-07",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-02-08",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-02-10",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-02-12",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-02-14",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-02-18",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-02-20",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-02-21",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-02-22",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-02-25",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-02-27",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-03-01",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-03-03",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-03-05",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-03-07",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-03-10",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-03-12",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-03-14",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-03-17",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-03-19",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-03-21",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-03-24",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-03-26",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-03-28",
            status="present",
        ),
        AttendanceRecord(
            student_id=demo_student.id,
            date="2024-03-31",
            status="present",
        ),
    ]
    db.add_all(attendance_records)
    db.commit()

    # Create assignment records
    assignment_records = [
        AssignmentRecord(
            student_id=demo_student.id,
            subject_id=math.id,
            title="Fraction Operations Homework",
            description="Practice fraction addition and subtraction",
            assigned_date="2024-01-10",
            due_date="2024-01-17",
            status="submitted",
            score=18,
            max_score=20,
        ),
        AssignmentRecord(
            student_id=demo_student.id,
            subject_id=math.id,
            title="Percentages Worksheet",
            description="Practice percentage calculations",
            assigned_date="2024-02-01",
            due_date="2024-02-08",
            status="submitted",
            score=45,
            max_score=50,
        ),
        AssignmentRecord(
            student_id=demo_student.id,
            subject_id=science.id,
            title="Electricity Circuit Lab",
            description="Build and analyze simple circuits",
            assigned_date="2024-01-15",
            due_date="2024-01-22",
            status="submitted",
            score=25,
            max_score=30,
        ),
        AssignmentRecord(
            student_id=demo_student.id,
            subject_id=english.id,
            title="Short Story Assignment",
            description="Write a creative short story (500 words)",
            assigned_date="2024-02-15",
            due_date="2024-02-22",
            status="submitted",
            score=40,
            max_score=50,
        ),
        AssignmentRecord(
            student_id=demo_student.id,
            subject_id=math.id,
            title="Algebra Practice Problems",
            description="Solve linear equations",
            assigned_date="2024-03-01",
            due_date="2024-03-08",
            status="pending",
            score=None,
            max_score=20,
        ),
    ]
    db.add_all(assignment_records)
    db.commit()

    # Create teacher feedback
    teacher_feedbacks = [
        TeacherFeedback(
            student_id=demo_student.id,
            subject_id=math.id,
            teacher_name="Ms. Sharma",
            feedback_text="Aarav is showing improvement in fractions. Continued practice with algebra will help build confidence.",
            feedback_date="2024-02-15",
            category="positive",
        ),
        TeacherFeedback(
            student_id=demo_student.id,
            subject_id=science.id,
            teacher_name="Mr. Johnson",
            feedback_text="Good understanding of basic electricity concepts. Encourage more hands-on circuit building.",
            feedback_date="2024-03-01",
            category="positive",
        ),
        TeacherFeedback(
            student_id=demo_student.id,
            subject_id=english.id,
            teacher_name="Mrs. Williams",
            feedback_text="Excellent creative writing skills. Strong performance in reading comprehension. Keep encouraging diverse reading.",
            feedback_date="2024-02-20",
            category="positive",
        ),
    ]
    db.add_all(teacher_feedbacks)
    db.commit()

    return {
        "status": "demo_data_initialized",
        "message": "Demo data seeded successfully",
        "students_created": 1,
        "subjects_created": 4,
        "topics_created": 10,
        "assessments_created": 8,
        "assessment_results_created": 8,
        "quiz_attempts_created": 8,
        "study_sessions_created": 4,
        "attendance_records_created": len(attendance_records),
        "assignment_records_created": len(assignment_records),
        "teacher_feedbacks_created": len(teacher_feedbacks),
    }