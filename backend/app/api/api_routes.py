from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Any
from datetime import datetime
import pandas as pd

from app.core.database import get_db, engine
from app.core.config import get_settings
from app.models.models import (
    User,
    ParentChild,
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
)
from app.schemas.schemas import (
    UserCreate,
    UserUpdate,
    UserResponse,
    Token,
    StudentCreate,
    StudentUpdate,
    StudentResponse,
    SubjectCreate,
    SubjectResponse,
    TopicCreate,
    TopicResponse,
    AssessmentCreate,
    AssessmentResponse,
    AssessmentResultCreate,
    AssessmentResultResponse,
    QuizAttemptCreate,
    QuizAttemptResponse,
    StudySessionCreate,
    StudySessionResponse,
    AttendanceRecordCreate,
    AttendanceRecordResponse,
    AssignmentRecordCreate,
    AssignmentRecordResponse,
    TeacherFeedbackCreate,
    TeacherFeedbackResponse,
    ParentDashboardSummary,
    StudentDashboardSummary,
    Recommendation,
    PracticeEffectiveness,
    CSVImportResult,
    HealthCheck,
    SubjectPerformance,
    TopicPerformance,
    AttendanceSummary,
    AssignmentSummary,
    MarksTrend,
)
from app.services.analytics_engine import DataAnalyzer

router = APIRouter(prefix="/api/v1", tags=["EduDrishti + LearnPulse"])


# Health check
@router.get("/health", response_model=HealthCheck)
async def health_check():
    """Health check endpoint."""
    return HealthCheck(
        status="healthy",
        version=get_settings().app_version,
        database="connected",
    )


# Authentication (MVP with demo mode)
@router.post("/demo/login", response_model=Token)
async def demo_login(
    student_id: int = Query(default=get_settings().demo_student_id),
    db: Session = Depends(get_db),
):
    """Login in demo mode with fictional student data."""
    from app.models.models import User, Student

    # Try to find or create demo user
    demo_user = db.query(User).filter(User.email == "demo@edudrishti.test").first()
    if not demo_user:
        from passlib.context import CryptContext
        pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
        demo_user = User(
            email="demo@edudrishti.test",
            hashed_password=pwd_ctx.hash("demo123"),
            full_name="Demo Parent",
            role="parent",
            language="en",
            is_active=True,
        )
        db.add(demo_user)
        db.commit()
        db.refresh(demo_user)

    # Get or create demo student
    demo_student = db.query(Student).filter(Student.user_id == demo_user.id).first()
    if not demo_student:
        demo_student = Student(
            user_id=demo_user.id,
            student_code="DEMO001",
            first_name="Aarav",
            last_name="Patel",
            date_of_birth="2015-06-15",
            grade="5",
            section="A",
            school_name="Demo International School",
        )
        db.add(demo_student)
        db.commit()
        db.refresh(demo_student)

    # Get parent-child relationships for this student
    parent_links = db.query(ParentChild).filter(ParentChild.student_id == demo_student.id).all()

    return Token(
        access_token=f"demo-{demo_student.id}",
        token_type="bearer",
    )


# Student endpoints
@router.get("/students", response_model=List[StudentResponse])
async def list_students(db: Session = Depends(get_db)):
    """List all students."""
    students = db.query(Student).all()
    return students


@router.get("/students/{student_id}", response_model=StudentResponse)
async def get_student(student_id: int, db: Session = Depends(get_db)):
    """Get a specific student by ID."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student


@router.post("/students", response_model=StudentResponse)
async def create_student(student: StudentCreate, db: Session = Depends(get_db)):
    """Create a new student."""
    # Check if student code already exists
    existing = db.query(Student).filter(Student.student_code == student.student_code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Student code already exists")

    # Create user first
    from passlib.context import CryptContext
    pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    user = User(
        email=f"{student.student_code.lower()}@edudrishti.test",
        hashed_password=pwd_ctx.hash("temp123"),
        full_name=f"{student.first_name} {student.last_name}",
        role="student",
        language="en",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Create student record
    db_student = Student(
        user_id=user.id,
        student_code=student.student_code,
        first_name=student.first_name,
        last_name=student.last_name,
        date_of_birth=student.date_of_birth,
        grade=student.grade,
        section=student.section,
        school_name=student.school_name,
        avatar_url=student.avatar_url,
    )
    db.add(db_student)
    db.commit()
    db.refresh(db_student)

    return db_student


# Subject endpoints
@router.get("/subjects", response_model=List[SubjectResponse])
async def list_subjects(db: Session = Depends(get_db)):
    """List all subjects."""
    subjects = db.query(Subject).all()
    return subjects


@router.post("/subjects", response_model=SubjectResponse)
async def create_subject(subject: SubjectCreate, db: Session = Depends(get_db)):
    """Create a new subject."""
    existing = db.query(Subject).filter(Subject.code == subject.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Subject code already exists")

    db_subject = Subject(
        name=subject.name,
        code=subject.code,
        description=subject.description,
        color=subject.color,
    )
    db.add(db_subject)
    db.commit()
    db.refresh(db_subject)

    return db_subject


# Topic endpoints
@router.get("/subjects/{subject_id}/topics", response_model=List[TopicResponse])
async def list_topics(subject_id: int, db: Session = Depends(get_db)):
    """List all topics for a subject."""
    topics = db.query(Topic).filter(Topic.subject_id == subject_id).all()
    return topics


@router.post("/topics", response_model=TopicResponse)
async def create_topic(topic: TopicCreate, db: Session = Depends(get_db)):
    """Create a new topic."""
    # Verify subject exists
    subject = db.query(Subject).filter(Subject.id == topic.subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Check for duplicate topic name in subject
    existing = db.query(Topic).filter(
        Topic.subject_id == topic.subject_id,
        Topic.name == topic.name,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Topic name already exists in this subject")

    db_topic = Topic(
        subject_id=topic.subject_id,
        name=topic.name,
        description=topic.description,
        order_index=topic.order_index,
        prerequisite_topic_id=topic.prerequisite_topic_id,
    )
    db.add(db_topic)
    db.commit()
    db.refresh(db_topic)

    return db_topic


# Assessment endpoints
@router.post("/assessments", response_model=AssessmentResponse)
async def create_assessment(assessment: AssessmentCreate, db: Session = Depends(get_db)):
    """Create a new assessment."""
    # Verify subject exists
    subject = db.query(Subject).filter(Subject.id == assessment.subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    db_assessment = Assessment(
        subject_id=assessment.subject_id,
        name=assessment.name,
        assessment_type=assessment.assessment_type,
        max_marks=assessment.max_marks,
        weight=assessment.weight,
        assessment_date=assessment.assessment_date,
        description=assessment.description,
    )
    db.add(db_assessment)
    db.commit()
    db.refresh(db_assessment)

    # Create topic mappings if provided
    if assessment.topic_mappings:
        for mapping in assessment.topic_mappings:
            topic = db.query(Topic).filter(Topic.id == mapping.get("topic_id")).first()
            if topic:
                mapping_obj = AssessmentTopicMapping(
                    assessment_id=db_assessment.id,
                    topic_id=topic.id,
                    marks_allocated=mapping.get("marks_allocated", db_assessment.max_marks / len(assessment.topic_mappings) if assessment.topic_mappings else 0),
                )
                db.add(mapping_obj)

    db.commit()

    return db_assessment


# Assessment result endpoints
@router.post("/assessment-results", response_model=AssessmentResultResponse)
async def create_assessment_result(
    result: AssessmentResultCreate, db: Session = Depends(get_db)
):
    """Create a new assessment result."""
    # Verify assessment exists
    assessment = db.query(Assessment).filter(Assessment.id == result.assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Verify student exists
    student = db.query(Student).filter(Student.id == result.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Calculate percentage
    percentage = 0
    if result.marks_obtained is not None and assessment.max_marks > 0:
        percentage = round((result.marks_obtained / assessment.max_marks) * 100, 2)

    db_result = AssessmentResult(
        student_id=result.student_id,
        assessment_id=result.assessment_id,
        marks_obtained=result.marks_obtained,
        percentage=percentage,
        remarks=result.remarks,
    )
    db.add(db_result)
    db.commit()
    db.refresh(db_result)

    return db_result


# Quiz attempt endpoints
@router.post("/quiz-attempts", response_model=QuizAttemptResponse)
async def create_quiz_attempt(
    attempt: QuizAttemptCreate, db: Session = Depends(get_db)
):
    """Create a new quiz attempt."""
    # Verify student exists
    student = db.query(Student).filter(Student.id == attempt.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Verify subject exists
    subject = db.query(Subject).filter(Subject.id == attempt.subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Verify topic exists
    topic = db.query(Topic).filter(Topic.id == attempt.topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    # Verify assessment exists if provided
    assessment = None
    if attempt.assessment_id:
        assessment = db.query(Assessment).filter(Assessment.id == attempt.assessment_id).first()
        if not assessment:
            raise HTTPException(status_code=404, detail="Assessment not found")

    # Calculate percentage
    percentage = 0
    if attempt.score is not None and attempt.max_score > 0:
        percentage = round((attempt.score / attempt.max_score) * 100, 2)

    db_attempt = QuizAttempt(
        student_id=attempt.student_id,
        subject_id=attempt.subject_id,
        topic_id=attempt.topic_id,
        assessment_id=attempt.assessment_id,
        score=attempt.score,
        max_score=attempt.max_score,
        percentage=percentage,
        time_taken_seconds=attempt.time_taken_seconds,
        notes=attempt.notes,
    )
    db.add(db_attempt)
    db.commit()
    db.refresh(db_attempt)

    return db_attempt


# Study session endpoints
@router.post("/study-sessions", response_model=StudySessionResponse)
async def create_study_session(
    session: StudySessionCreate, db: Session = Depends(get_db)
):
    """Create a new study session record."""
    # Verify student exists
    student = db.query(Student).filter(Student.id == session.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Verify subject exists if provided
    if session.subject_id:
        subject = db.query(Subject).filter(Subject.id == session.subject_id).first()
        if not subject:
            raise HTTPException(status_code=404, detail="Subject not found")

    # Verify topic exists if provided
    if session.topic_id:
        topic = db.query(Topic).filter(Topic.id == session.topic_id).first()
        if not topic:
            raise HTTPException(status_code=404, detail="Topic not found")

    db_session = StudySession(
        student_id=session.student_id,
        subject_id=session.subject_id,
        topic_id=session.topic_id,
        activity_type=session.activity_type,
        duration_minutes=session.duration_minutes,
        session_date=session.session_date,
        notes=session.notes,
        quiz_score=session.quiz_score,
        quiz_max_score=session.quiz_max_score,
    )
    db.add(db_session)
    db.commit()
    db.refresh(db_session)

    return db_session


# Attendance record endpoints
@router.post("/attendance-records", response_model=AttendanceRecordResponse)
async def create_attendance_record(
    record: AttendanceRecordCreate, db: Session = Depends(get_db)
):
    """Create a new attendance record."""
    # Verify student exists
    student = db.query(Student).filter(Student.id == record.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Check for duplicate
    existing = db.query(AttendanceRecord).filter(
        AttendanceRecord.student_id == record.student_id,
        AttendanceRecord.date == record.date,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Attendance record already exists for this date")

    db_record = AttendanceRecord(
        student_id=record.student_id,
        date=record.date,
        status=record.status,
        period=record.period,
        notes=record.notes,
    )
    db.add(db_record)
    db.commit()
    db.refresh(db_record)

    return db_record


# Assignment record endpoints
@router.post("/assignment-records", response_model=AssignmentRecordResponse)
async def create_assignment_record(
    record: AssignmentRecordCreate, db: Session = Depends(get_db)
):
    """Create a new assignment record."""
    # Verify student exists
    student = db.query(Student).filter(Student.id == record.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Verify subject exists if provided
    if record.subject_id:
        subject = db.query(Subject).filter(Subject.id == record.subject_id).first()
        if not subject:
            raise HTTPException(status_code=404, detail="Subject not found")

    db_record = AssignmentRecord(
        student_id=record.student_id,
        subject_id=record.subject_id,
        title=record.title,
        description=record.description,
        assigned_date=record.assigned_date,
        due_date=record.due_date,
        submitted_date=record.submitted_date,
        status=record.status,
        score=record.score,
        max_score=record.max_score,
    )
    db.add(db_record)
    db.commit()
    db.refresh(db_record)

    return db_record


# Parent dashboard endpoint
@router.get("/parents/dashboard/{student_id}", response_model=ParentDashboardSummary)
async def get_parent_dashboard(
    student_id: int,
    db: Session = Depends(get_db),
    language: str = Query(default="en"),
):
    """Get parent dashboard summary for a student."""
    # Verify student exists
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    analyzer = DataAnalyzer()

    # Get assessment results
    results = pd.DataFrame(
        [
            {
                "student_id": r.student_id,
                "assessment_id": r.assessment_id,
                "marks_obtained": r.marks_obtained,
                "percentage": r.percentage,
                "subject_id": r.assessment.subject_id,
                "assessment_name": r.assessment.name,
                "assessment_date": r.assessment.assessment_date,
                "assessment_type": r.assessment.assessment_type,
            }
            for r in student.assessments
        ]
        if student.assessments
        else pd.DataFrame(columns=["student_id", "assessment_id", "marks_obtained", "percentage", "subject_id", "assessment_name", "assessment_date", "assessment_type"])
    )

    # Get quiz attempts
    quiz_attempts = pd.DataFrame(
        [
            {
                "student_id": a.student_id,
                "subject_id": a.subject_id,
                "topic_id": a.topic_id,
                "assessment_id": a.assessment_id,
                "score": a.score,
                "max_score": a.max_score,
                "percentage": a.percentage,
                "attempt_date": a.attempt_date,
                "topic_name": a.topic.name if a.topic else None,
                "subject_name": a.subject.name if a.subject else None,
            }
            for a in student.quiz_attempts
        ]
        if student.quiz_attempts
        else pd.DataFrame(columns=["student_id", "subject_id", "topic_id", "assessment_id", "score", "max_score", "percentage", "attempt_date", "topic_name", "subject_name"])
    )

    # Get study sessions
    study_sessions = pd.DataFrame(
        [
            {
                "student_id": s.student_id,
                "subject_id": s.subject_id,
                "topic_id": s.topic_id,
                "activity_type": s.activity_type,
                "duration_minutes": s.duration_minutes,
                "session_date": s.session_date,
                "notes": s.notes,
                "quiz_score": s.quiz_score,
                "quiz_max_score": s.quiz_max_score,
                "topic_name": s.topic.name if s.topic else None,
                "subject_name": s.subject.name if s.subject else None,
            }
            for s in student.study_sessions
        ]
        if student.study_sessions
        else pd.DataFrame(columns=["student_id", "subject_id", "topic_id", "activity_type", "duration_minutes", "session_date", "notes", "quiz_score", "quiz_max_score", "topic_name", "subject_name"])
    )

    # Get attendance records
    attendance_records = pd.DataFrame(
        [
            {
                "student_id": a.student_id,
                "date": a.date,
                "status": a.status,
                "period": a.period,
            }
            for a in student.attendance_records
        ]
        if student.attendance_records
        else pd.DataFrame(columns=["student_id", "date", "status", "period"])
    )

    # Get assignment records
    assignment_records = pd.DataFrame(
        [
            {
                "student_id": a.student_id,
                "subject_id": a.subject_id,
                "title": a.title,
                "description": a.description,
                "assigned_date": a.assigned_date,
                "due_date": a.due_date,
                "submitted_date": a.submitted_date,
                "status": a.status,
                "score": a.score,
                "max_score": a.max_score,
            }
            for a in student.assignment_records
        ]
        if student.assignment_records
        else pd.DataFrame(columns=["student_id", "subject_id", "title", "description", "assigned_date", "due_date", "submitted_date", "status", "score", "max_score"])
    )

    # Get teacher feedback
    feedback_records = [
        {
            "id": f.id,
            "teacher_name": f.teacher_name,
            "feedback_text": f.feedback_text,
            "feedback_date": str(f.feedback_date) if f.feedback_date else None,
            "category": f.category,
            "subject_name": f.subject.name if f.subject else None,
        }
        for f in student.teacher_feedbacks
    ]

    # 1. Overall average
    if not results.empty and "percentage" in results.columns:
        overall_average = round(results["percentage"].mean(), 2)
    else:
        overall_average = 0

    # 2. Subject performance
    subject_performance = []
    if not results.empty:
        subject_stats = (
            results.groupby("subject_id")
            .agg(
                average_percentage=("percentage", "mean"),
                latest_score=("percentage", lambda x: x.iloc[-1] if len(x) > 0 else None),
                total_assessments=("percentage", "count"),
            )
            .reset_index()
        )

        subject_color_map = {
            1: "#3B82F6",  # Math - blue
            2: "#10B981",  # Science - green
            3: "#F59E0B",  # English - amber
            4: "#8B5CF6",  # Humanities - purple
        }

        for _, row in subject_stats.iterrows():
            subject_id = row["subject_id"]
            # Get subject name
            subject_name = next(
                (s.name for s in student.subjects if s.id == subject_id), f"Subject {subject_id}"
            )

            # Determine trend
            subject_results = results[results["subject_id"] == subject_id]
            if len(subject_results) >= 3:
                scores = subject_results["percentage"].tolist()
                trend = analyzer.calculate_trend_direction(scores)
            elif len(subject_results) >= 2:
                scores = subject_results["percentage"].tolist()
                trend = analyzer.calculate_trend_direction(scores)
            else:
                trend = TrendDirection.INSUFFICIENT_DATA

            performance_status = analyzer.classify_performance_status(row["average_percentage"])

            # Get color based on subject
            color = subject_color_map.get(subject_id, "#3B82F6")

            subject_performance.append(
                SubjectPerformance(
                    subject_id=subject_id,
                    subject_name=subject_name,
                    subject_code=next(
                        (s.code for s in student.subjects if s.id == subject_id), "UNK"
                    ),
                    average_percentage=round(row["average_percentage"], 2),
                    latest_score=row["latest_score"],
                    trend=trend.value,
                    total_assessments=row["total_assessments"],
                    color=color,
                ).dict()
            )

    # 3. Topic performance
    topic_performance = []
    topic_stats = analyzer.calculate_topic_performance(quiz_attempts, results)

    topic_color_map = {
        "fractions": "#3B82F6",
        "percentages": "#10B981",
        "algebra": "#F59E0B",
        "electricity": "#8B5CF6",
        "reading_comprehension": "#EF4444",
    }

    for topic_id_str, stats in topic_stats.items():
        topic_id = int(topic_id_str)
        latest_pct = stats.get("average_percentage", 0)
        trend = TrendDirection(stats.get("trend", "insufficient_data"))
        attempts = stats.get("attempts_count", 0)
        needs_practice = latest_pct < 60 if latest_pct else True

        # Get topic name
        topic_name = next(
            (t.name for t in student.subjects[0].topics if t.id == topic_id) if student.subjects else None,
            f"Topic {topic_id}",
        )
        subject_name = student.subjects[0].name if student.subjects else "Unknown"

        color = topic_color_map.get(topic_name.lower(), "#3B82F6")

        topic_performance.append(
            TopicPerformance(
                topic_id=topic_id,
                topic_name=topic_name,
                subject_name=subject_name,
                average_percentage=round(latest_pct, 2),
                latest_score=stats.get("latest_score"),
                trend=trend.value,
                attempts_count=attempts,
                needs_practice=needs_practice,
            ).dict()
        )

    # 4. Attendance summary
    if not attendance_records.empty:
        attendance_summary = analyzer.calculate_attendance_percentage(attendance_records)
    else:
        attendance_summary = AttendanceSummary(
            total_days=0,
            present_days=0,
            absent_days=0,
            late_days=0,
            attendance_percentage=0,
            trend="insufficient_data",
        )

    # 5. Assignment summary
    if not assignment_records.empty:
        assignment_summary = analyzer.calculate_assignment_completion(assignment_records)
    else:
        assignment_summary = AssignmentSummary(
            total_assignments=0,
            completed=0,
            pending=0,
            overdue=0,
            completion_rate=0,
        )

    # 6. Marks trend
    marks_trend = []
    if not results.empty:
        # Sort by date
        results_sorted = results.sort_values("assessment_date")
        for _, row in results_sorted.head(10).iterrows():
            subject_name = next(
                (s.name for s in student.subjects if s.id == row["subject_id"]), f"Subject {row['subject_id']}"
            )
            marks_trend.append(
                MarksTrend(
                    assessment_name=row.get("assessment_name", "Assessment"),
                    assessment_date=row.get("assessment_date", ""),
                    subject_name=subject_name,
                    percentage=round(row.get("percentage", 0), 2),
                    marks_obtained=row.get("marks_obtained", 0),
                    max_marks=assessment.max_marks if "assessment" in results.columns else 100,
                ).dict()
            )

    # 7. Weak topics (below 65%)
    weak_topics = [
        tp for tp in topic_performance if tp.get("average_percentage", 0) < 65
    ]

    # 8. Generate recommendations
    recommendations = analyzer.generate_recommendations(topic_stats, quiz_attempts, student_id)

    # 9. Recent feedback
    recent_feedbacks = sorted(feedback_records, key=lambda x: x.get("feedback_date", ""), reverse=True)[:5]

    # Summaries translations
    trend_translations = {
        "improving": "improving",
        "stable": "stable",
        "declining": "declining",
        "insufficient_data": "insufficient data",
    }
    performance_translations = {
        "good": "good",
        "fair": "fair",
        "needs_improvement": "needs improvement",
        "critical": "critical",
    }

    return ParentDashboardSummary(
        student=StudentResponse(
            id=student.id,
            student_code=student.student_code,
            first_name=student.first_name,
            last_name=student.last_name,
            date_of_birth=str(student.date_of_birth) if student.date_of_birth else None,
            grade=student.grade,
            section=student.section,
            school_name=student.school_name,
            avatar_url=student.avatar_url,
        ),
        overall_average=overall_average,
        subject_performance=subject_performance,
        topic_performance=topic_performance,
        attendance=attendance_summary,
        assignments=assignment_summary,
        marks_trend=marks_trend,
        recent_feedbacks=recent_feedbacks,
        weak_topics=weak_topics,
        recommendations=recommendations,
    )


# Student dashboard endpoint
@router.get("/students/dashboard/{student_id}", response_model=StudentDashboardSummary)
async def get_student_dashboard(
    student_id: int,
    db: Session = Depends(get_db),
    language: str = Query(default="en"),
):
    """Get student dashboard summary."""
    # Verify student exists
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    analyzer = DataAnalyzer()

    # Get assessment results
    results = pd.DataFrame(
        [
            {
                "student_id": r.student_id,
                "assessment_id": r.assessment_id,
                "marks_obtained": r.marks_obtained,
                "percentage": r.percentage,
                "subject_id": r.assessment.subject_id,
                "assessment_name": r.assessment.name,
                "assessment_date": str(r.assessment.assessment_date) if r.assessment.assessment_date else None,
                "assessment_type": r.assessment.assessment_type,
            }
            for r in student.assessments
        ]
        if student.assessments
        else pd.DataFrame(columns=["student_id", "assessment_id", "marks_obtained", "percentage", "subject_id", "assessment_name", "assessment_date", "assessment_type"])
    )

    # Get quiz attempts
    quiz_attempts = pd.DataFrame(
        [
            {
                "student_id": a.student_id,
                "subject_id": a.subject_id,
                "topic_id": a.topic_id,
                "assessment_id": a.assessment_id,
                "score": a.score,
                "max_score": a.max_score,
                "percentage": a.percentage,
                "attempt_date": str(a.attempt_date) if a.attempt_date else None,
                "topic_name": a.topic.name if a.topic else None,
                "subject_name": a.subject.name if a.subject else None,
            }
            for a in student.quiz_attempts
        ]
        if student.quiz_attempts
        else pd.DataFrame(columns=["student_id", "subject_id", "topic_id", "assessment_id", "score", "max_score", "percentage", "attempt_date", "topic_name", "subject_name"])
    )

    # Get study sessions
    study_sessions = pd.DataFrame(
        [
            {
                "student_id": s.student_id,
                "subject_id": s.subject_id,
                "topic_id": s.topic_id,
                "activity_type": s.activity_type,
                "duration_minutes": s.duration_minutes,
                "session_date": str(s.session_date) if s.session_date else None,
                "notes": s.notes,
                "quiz_score": s.quiz_score,
                "quiz_max_score": s.quiz_max_score,
                "topic_name": s.topic.name if s.topic else None,
                "subject_name": s.subject.name if s.subject else None,
            }
            for s in student.study_sessions
        ]
        if student.study_sessions
        else pd.DataFrame(columns=["student_id", "subject_id", "topic_id", "activity_type", "duration_minutes", "session_date", "notes", "quiz_score", "quiz_max_score", "topic_name", "subject_name"])
    )

    # Get subject performance
    subject_performance = []
    if not results.empty:
        subject_stats = (
            results.groupby("subject_id")
            .agg(
                average_percentage=("percentage", "mean"),
                latest_score=("percentage", lambda x: x.iloc[-1] if len(x) > 0 else None),
                total_assessments=("percentage", "count"),
            )
            .reset_index()
        )

        for _, row in subject_stats.iterrows():
            subject_id = row["subject_id"]
            subject_name = next(
                (s.name for s in student.subjects if s.id == subject_id), f"Subject {subject_id}"
            )

            # Determine trend
            subject_results = results[results["subject_id"] == subject_id]
            if len(subject_results) >= 3:
                scores = subject_results["percentage"].tolist()
                trend = analyzer.calculate_trend_direction(scores)
            elif len(subject_results) >= 2:
                scores = subject_results["percentage"].tolist()
                trend = analyzer.calculate_trend_direction(scores)
            else:
                trend = TrendDirection.INSUFFICIENT_DATA

            performance_status = analyzer.classify_performance_status(row["average_percentage"])

            subject_performance.append(
                SubjectPerformance(
                    subject_id=subject_id,
                    subject_name=subject_name,
                    subject_code=next(
                        (s.code for s in student.subjects if s.id == subject_id), "UNK"
                    ),
                    average_percentage=round(row["average_percentage"], 2),
                    latest_score=row["latest_score"],
                    trend=trend.value,
                    total_assessments=row["total_assessments"],
                    color="#3B82F6",
                ).dict()
            )

    # Get topic performance
    topic_performance = []
    topic_stats = analyzer.calculate_topic_performance(quiz_attempts, results)

    for topic_id_str, stats in topic_stats.items():
        topic_id = int(topic_id_str)
        latest_pct = stats.get("average_percentage", 0)
        trend = TrendDirection(stats.get("trend", "insufficient_data"))
        attempts = stats.get("attempts_count", 0)

        topic_name = next(
            (t.name for t in student.subjects[0].topics if t.id == topic_id) if student.subjects else None,
            f"Topic {topic_id}",
        )
        subject_name = student.subjects[0].name if student.subjects else "Unknown"

        topic_performance.append(
            TopicPerformance(
                topic_id=topic_id,
                topic_name=topic_name,
                subject_name=subject_name,
                average_percentage=round(latest_pct, 2),
                latest_score=stats.get("latest_score"),
                trend=trend.value,
                attempts_count=attempts,
            ).dict()
        )

    # Recent quiz attempts
    recent_quiz_attempts = []
    if not quiz_attempts.empty:
        attempts_sorted = quiz_attempts.sort_values("attempt_date", ascending=False)
        for _, row in attempts_sorted.head(10).iterrows():
            recent_quiz_attempts.append(
                QuizAttemptResponse(
                    id=row.get("id", 0),
                    student_id=row.get("student_id", student_id),
                    subject_id=row.get("subject_id", 0),
                    topic_id=row.get("topic_id", 0),
                    assessment_id=row.get("assessment_id"),
                    score=row.get("score", 0),
                    max_score=row.get("max_score", 100),
                    percentage=row.get("percentage", 0),
                    attempt_date=row.get("attempt_date"),
                ).dict()
            )

    # Practice effectiveness analysis
    practice_effectiveness = analyzer.calculate_practice_effectiveness(quiz_attempts, study_sessions)

    # Generate recommendations
    recommendations = analyzer.generate_recommendations(topic_stats, quiz_attempts, student_id)

    # Learning timeline
    learning_timeline = []
    if not results.empty:
        results_sorted = results.sort_values("assessment_date")
        for _, row in results_sorted.head(10).iterrows():
            subject_name = next(
                (s.name for s in student.subjects if s.id == row["subject_id"]), f"Subject {row['subject_id']}"
            )
            learning_timeline.append(
                {
                    "assessment_name": row.get("assessment_name", "Assessment"),
                    "assessment_date": row.get("assessment_date", ""),
                    "subject_name": subject_name,
                    "percentage": round(row.get("percentage", 0), 2),
                    "marks_obtained": row.get("marks_obtained", 0),
                    "max_marks": 100,
                }
            )



    return StudentDashboardSummary(
        student=StudentResponse(
            id=student.id,
            student_code=student.student_code,
            first_name=student.first_name,
            last_name=student.last_name,
            date_of_birth=str(student.date_of_birth) if student.date_of_birth else None,
            grade=student.grade,
            section=student.section,
            school_name=student.school_name,
            avatar_url=student.avatar_url,
        ),
        subject_performance=subject_performance,
        topic_performance=topic_performance,
        recent_quiz_attempts=recent_quiz_attempts,
        study_sessions=study_sessions.to_dict("records") if not study_sessions.empty else [],
        practice_effectiveness=practice_effectiveness,
        recommendations=recommendations,
        learning_timeline=learning_timeline,
    )


# CSV Import endpoint
@router.post("/import/csv", response_model=CSVImportResult)
async def import_csv_data(
    file_data: str = ...,
    db: Session = Depends(get_db),
    data_type: str = Query(..., enum=["assessments", "quizzes", "attendance", "assignments", "study_sessions"]),
):
    """Import data from CSV format."""
    import base64
    import io

    # Decode base64 data
    try:
        decoded = base64.b64decode(file_data).decode("utf-8")
        df = pd.read_csv(io.StringIO(decoded))
    except Exception as e:
        return CSVImportResult(
            success=False,
            imported_count=0,
            rejected_count=0,
            errors=[{"message": f"Failed to parse CSV: {str(e)}"}],
            rejected_rows=[],
        )

    # Validate based on type
    validator = DataAnalyzer()

    if data_type == "assessments":
        validation_result = validator.validate_assessment_csv(df)
    elif data_type == "quizzes":
        validation_result = validator.validate_quiz_csv(df)
    elif data_type == "attendance":
        validation_result = validator.validate_attendance_csv(df)
    elif data_type == "assignments":
        validation_result = validator.validate_assignment_csv(df)
    elif data_type == "study_sessions":
        validation_result = validator.validate_study_session_csv(df)
    else:
        return CSVImportResult(
            success=False,
            imported_count=0,
            rejected_count=0,
            errors=[{"message": f"Unknown data type: {data_type}"}],
            rejected_rows=[],
        )

    # Process valid rows
    imported_count = 0
    errors = []
    rejected_rows = []

    for _, row in validation_result.cleaned_data.iterrows():
        try:
            if data_type == "assessments":
                # Create assessment
                subject = db.query(Subject).filter(Subject.name == row["subject"]).first()
                if not subject:
                    # Create subject if not exists
                    subject = Subject(name=row["subject"], code=row["subject"][:10].upper())
                    db.add(subject)
                    db.commit()

                assessment_type_map = {
                    "quiz": "quiz",
                    "exam": "exam",
                    "assignment": "assignment",
                    "practice": "practice",
                }
                assessment_type = assessment_type_map.get(
                    row.get("assessment_type", "quiz"), "quiz"
                )

                assessment = Assessment(
                    subject_id=subject.id,
                    name=row["assessment_name"],
                    assessment_type=assessment_type,
                    max_marks=float(row["max_marks"]),
                    weight=float(row.get("weight", 1.0)),
                    assessment_date=pd.to_datetime(row["assessment_date"]).date()
                    if pd.notna(pd.to_datetime(row["assessment_date"]))
                    else None,
                    description=row.get("description"),
                )
                db.add(assessment)
                db.commit()
                db.refresh(assessment)

                # Create assessment result
                marks_obtained = float(row["marks_obtained"]) if pd.notna(row["marks_obtained"]) else 0
                percentage = round((marks_obtained / float(row["max_marks"])) * 100, 2) if float(row["max_marks"]) > 0 else 0

                assessment_result = AssessmentResult(
                    student_id=1,  # Default/demo student
                    assessment_id=assessment.id,
                    marks_obtained=marks_obtained,
                    percentage=percentage,
                    remarks=row.get("remarks"),
                )
                db.add(assessment_result)
                db.commit()

                imported_count += 1

            elif data_type == "quizzes":
                # Create quiz attempt
                attempt = QuizAttempt(
                    student_id=1,  # Default/demo student
                    subject_id=1,
                    topic_id=1,
                    assessment_id=None,
                    score=float(row["score"]) if pd.notna(row["score"]) else 0,
                    max_score=float(row["max_score"]) if pd.notna(row["max_score"]) else 100,
                    time_taken_seconds=int(row["time_taken_seconds"]) if pd.notna(row["time_taken_seconds"]) else None,
                    notes=row.get("notes"),
                )
                db.add(attempt)
                db.commit()

                imported_count += 1

            elif data_type == "attendance":
                # Create attendance record
                attendance_status = row.get("status", "present").lower()
                valid_statuses = ["present", "absent", "late", "excused"]
                if attendance_status not in valid_statuses:
                    attendance_status = "present"

                attendance_record = AttendanceRecord(
                    student_id=1,
                    date=pd.to_datetime(row["date"]).date()
                    if pd.notna(pd.to_datetime(row["date"]))
                    else None,
                    status=attendance_status,
                    period=row.get("period"),
                    notes=row.get("notes"),
                )
                db.add(attendance_record)
                db.commit()

                imported_count += 1

            elif data_type == "assignments":
                # Create assignment record
                assignment_status = row.get("status", "pending").lower()
                valid_assignment_statuses = ["pending", "submitted", "overdue", "graded"]
                if assignment_status not in valid_assignment_statuses:
                    assignment_status = "pending"

                assignment_record = AssignmentRecord(
                    student_id=1,
                    subject_id=1,
                    title=row.get("title", "Unnamed Assignment"),
                    description=row.get("description"),
                    assigned_date=pd.to_datetime(row["assigned_date"]).date()
                    if pd.notna(pd.to_datetime(row["assigned_date"]))
                    else None,
                    due_date=pd.to_datetime(row["due_date"]).date()
                    if pd.notna(pd.to_datetime(row["due_date"]))
                    else None,
                    submitted_date=pd.to_datetime(row["submitted_date"]).date()
                    if pd.notna(pd.to_datetime(row["submitted_date"]))
                    else None,
                    status=assignment_status,
                    score=float(row["score"]) if pd.notna(row.get("score")) else None,
                    max_score=float(row["max_score"]) if pd.notna(row.get("max_score")) else None,
                )
                db.add(assignment_record)
                db.commit()

                imported_count += 1

            elif data_type == "study_sessions":
                # Create study session
                activity_type = row.get("activity_type", "study").lower()
                valid_activity_types = ["study", "quiz", "revision", "homework"]
                if activity_type not in valid_activity_types:
                    activity_type = "study"

                study_session = StudySession(
                    student_id=1,
                    subject_id=1,
                    topic_id=1,
                    activity_type=activity_type,
                    duration_minutes=int(row["duration_minutes"])
                    if pd.notna(row["duration_minutes"])
                    else 0,
                    session_date=pd.to_datetime(row["session_date"]).date()
                    if pd.notna(pd.to_datetime(row["session_date"]))
                    else None,
                    notes=row.get("notes"),
                    quiz_score=float(row["quiz_score"]) if pd.notna(row.get("quiz_score")) else None,
                    quiz_max_score=float(row["quiz_max_score"]) if pd.notna(row.get("quiz_max_score")) else None,
                )
                db.add(study_session)
                db.commit()

                imported_count += 1

        except Exception as e:
            error_info = {
                "row": row.to_dict() if hasattr(row, "to_dict") else str(row),
                "message": str(e),
            }
            errors.append(error_info)
            row_dict = row.to_dict() if hasattr(row, "to_dict") else {"raw": str(row)}
            rejected_rows.append({**row_dict, "error": str(e)})

    # Return results
    return CSVImportResult(
        success=validation_result.is_valid,
        imported_count=imported_count,
        rejected_count=len(validation_result.rejected_rows),
        errors=errors,
        rejected_rows=validation_result.rejected_rows,
    )


# Recommendations endpoint
@router.get("/recommendations/{student_id}", response_model=List[Recommendation])
async def get_recommendations(
    student_id: int,
    db: Session = Depends(get_db),
    language: str = Query(default="en"),
):
    """Get personalized recommendations for a student."""
    # Verify student exists
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    analyzer = DataAnalyzer()

    # Get quiz attempts
    quiz_attempts = pd.DataFrame(
        [
            {
                "student_id": a.student_id,
                "subject_id": a.subject_id,
                "topic_id": a.topic_id,
                "assessment_id": a.assessment_id,
                "score": a.score,
                "max_score": a.max_score,
                "percentage": a.percentage,
                "attempt_date": a.attempt_date,
                "topic_name": a.topic.name if a.topic else None,
                "subject_name": a.subject.name if a.subject else None,
            }
            for a in student.quiz_attempts
        ]
        if student.quiz_attempts
        else pd.DataFrame(columns=["student_id", "subject_id", "topic_id", "assessment_id", "score", "max_score", "percentage", "attempt_date", "topic_name", "subject_name"])
    )

    # Get topic stats
    topic_stats = analyzer.calculate_topic_performance(quiz_attempts)

    # Generate recommendations
    recommendations = analyzer.generate_recommendations(topic_stats, quiz_attempts, student_id)

    return recommendations


# Practice effectiveness endpoint
@router.get("/practice-effectiveness/{student_id}", response_model=PracticeEffectiveness)
async def get_practice_effectiveness(
    student_id: int,
    db: Session = Depends(get_db),
):
    """Get practice effectiveness analysis for a student."""
    # Verify student exists
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    analyzer = DataAnalyzer()

    # Get quiz attempts
    quiz_attempts = pd.DataFrame(
        [
            {
                "student_id": a.student_id,
                "subject_id": a.subject_id,
                "topic_id": a.topic_id,
                "assessment_id": a.assessment_id,
                "score": a.score,
                "max_score": a.max_score,
                "percentage": a.percentage,
                "attempt_date": a.attempt_date,
                "topic_name": a.topic.name if a.topic else None,
                "subject_name": a.subject.name if a.subject else None,
            }
            for a in student.quiz_attempts
        ]
        if student.quiz_attempts
        else pd.DataFrame(columns=["student_id", "subject_id", "topic_id", "assessment_id", "score", "max_score", "percentage", "attempt_date", "topic_name", "subject_name"])
    )

    # Get study sessions
    study_sessions = pd.DataFrame(
        [
            {
                "student_id": s.student_id,
                "subject_id": s.subject_id,
                "topic_id": s.topic_id,
                "activity_type": s.activity_type,
                "duration_minutes": s.duration_minutes,
                "session_date": str(s.session_date) if s.session_date else None,
                "notes": s.notes,
                "quiz_score": s.quiz_score,
                "quiz_max_score": s.quiz_max_score,
            }
            for s in student.study_sessions
        ]
        if student.study_sessions
        else pd.DataFrame(columns=["student_id", "subject_id", "topic_id", "activity_type", "duration_minutes", "session_date", "notes", "quiz_score", "quiz_max_score"])
    )

    effectiveness = analyzer.calculate_practice_effectiveness(quiz_attempts, study_sessions)

    return PracticeEffectiveness(**effectiveness)


# Export endpoints for dashboard data
@router.get("/export/dashboard/{student_id}")
async def export_dashboard_data(
    student_id: int,
    format: str = Query(default="json"),
    db: Session = Depends(get_db),
):
    """Export dashboard data in specified format."""
    from fastapi.responses import JSONResponse

    # Get parent dashboard data
    dashboard = await get_parent_dashboard(student_id, db)

    if format.lower() == "json":
        return JSONResponse(content=dashboard.dict())
    else:
        return JSONResponse(content=dashboard.dict())


# Include the router in the app
# This file should be imported in main.py
