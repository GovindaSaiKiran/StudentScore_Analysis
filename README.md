# EduDrishti + LearnPulse

## Student Learning Intelligence & Parent Accessibility Platform

### Overview

EduDrishti + LearnPulse is a comprehensive web application that bridges the gap between parents and students' learning data. The platform provides two primary experiences:

- **Parent Experience (EduDrishti)**: Helps parents understand their child's academic progress through simple graphs, attendance tracking, and plain-language explanations.
- **Student Experience (LearnPulse)**: Helps students track progress by subject and individual topic, record quiz results, and receive recommendations for what to study next.

The core differentiator is the connection between student-level data, topic-level learning analytics, and explainable recommendations in local languages.

### Problem Statement

Many parents have difficulty interpreting school report cards, academic percentages, attendance statistics, and complicated educational terminology. Some parents have limited formal education or prefer listening to information in their local language. Students and teachers need better ways to understand learning progress and identify topics requiring additional practice.

### Key Features

1. **Data Science Engine**: Real calculations using Python, Pandas, and NumPy for performance analysis, trend detection, and personalized recommendations
2. **Topic-Level Analytics**: Learning at the topic level rather than relying exclusively on overall marks
3. **Voice Audio Readout**: Spoken summary narration for parent accessibility
4. **Parent Dashboard**: Overview of child's performance, attendance, and recommendations
5. **Student Dashboard**: Topic mastery visualization, quiz recording, and study tracking
6. **CSV Import**: Import assessment data from CSV files with validation
7. **Demo Data**: Pre-seeded fictional student data for immediate exploration

### Technology Stack

**Frontend:**
- React 18 with TypeScript
- Vite build tool
- Tailwind CSS v4 for styling
- Recharts for interactive charts
- Lucide React for icons
- react-i18next for multilingual support

**Backend:**
- FastAPI with Python 3.11+
- SQLAlchemy for database access
- Alembic for migrations
- Pandas and NumPy for data processing
- scikit-learn for analytics
- SQLite for initial implementation

**Data Science:**
- Custom analytics engine with transparent rules
- Trend classification using historical data
- Practice effectiveness analysis
- Personalized recommendation engine
- CSV import and validation

### Project Structure

```
eduDrishti-learnpulse/
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI routes
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/     # Business logic and analytics
│   │   ├── core/         # Configuration and database
│   │   └── utils/        # Utility modules
│   ├── alembic/          # Database migrations
│   ├── requirements.txt
│   └── main.py           # FastAPI entry point
├── frontend/
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── utils/        # Utility functions
│   │   └── locales/      # Translation files
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
├── tests/                # Test suites
└── README.md
```

### Data Science Workflow

The analytics engine provides the following capabilities:

1. **Data Validation and Cleaning**:
   - Missing-value detection
   - Duplicate record detection
   - Data-type validation
   - Invalid score detection (negative scores, scores exceeding max)
   - Score-range validation (0 to max_marks)
   - Date format validation
   - Inconsistent subject/topic label detection
   - Meaningful error reporting for each rejected row

2. **Academic Performance Analysis**:
   - Average score by subject
   - Score changes between comparable assessments
   - Percentage-point changes where appropriate
   - Attendance percentage calculation
   - Assignment completion rate
   - Topic-level average scores
   - Recent performance trends
   - Number of recorded assessments and attempts
   - Score normalization when max marks differ between assessments

3. **Learning Trend Analysis**:
   - Improving/Stable/Declining classification
   - Transparent rules documented and tested
   - Edge case handling
   - No classification of single noisy score changes as reliable long-term trends

4. **Practice Effectiveness Analysis**:
   - Comparison of quiz results before and after practice periods
   - Analysis of score improvements across topics
   - Explanation that observed improvements are evidence of assessment improvement, not causation proof
   - Caution against unsupported claims with small observation counts

5. **Personalized Recommendations**:
   - Deterministic recommendation engine
   - Transparent criteria: repeated low scores, recent declines, incomplete practice, prerequisite relationships
   - Each recommendation includes: topic, reason, supporting measurements, suggested action, confidence indicator
   - Advice grounded in underlying data, not AI-generated disconnect

6. **Optional Machine Learning** (if dataset supports it):
   - Train/test split with proper validation
   - Avoidance of leakage from future assessments
   - Comparison against simple baseline models
   - Relevant evaluation metrics reporting
   - Documented limitations
   - No guaranteed predictions
   - No fabricated demo data claims

### Installation

#### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

#### Database Initialization

The application automatically creates database tables on first run. To initialize manually:

```bash
cd backend
python -m app.core.database  # Creates all tables
```

### Local Development

#### Backend

```bash
cd backend
uvicorn main:app --reload
```

Server runs at `http://127.0.0.1:8000`

#### Frontend

```bash
cd frontend
npm run dev
```

Development server runs at `http://localhost:5173`

### API Endpoints

The backend provides the following documented, validated REST endpoints:

- `GET /api/v1/health` - Health check
- `POST /api/v1/demo/login` - Demo mode login
- `GET /api/v1/students` - List all students
- `GET /api/v1/students/{id}` - Get student by ID
- `POST /api/v1/students` - Create student
- `GET /api/v1/subjects` - List all subjects
- `POST /api/v1/subjects` - Create subject
- `GET /api/v1/subjects/{id}/topics` - List topics for subject
- `POST /api/v1/topics` - Create topic
- `POST /api/v1/assessments` - Create assessment
- `POST /api/v1/assessment-results` - Create assessment result
- `POST /api/v1/quiz-attempts` - Create quiz attempt
- `POST /api/v1/study-sessions` - Create study session
- `POST /api/v1/attendance-records` - Create attendance record
- `POST /api/v1/assignment-records` - Create assignment record
- `GET /api/v1/parents/dashboard/{student_id}` - Parent dashboard summary
- `GET /api/v1/students/dashboard/{student_id}` - Student dashboard summary
- `GET /api/v1/recommendations/{student_id}` - Personalized recommendations
- `GET /api/v1/practice-effectiveness/{student_id}` - Practice effectiveness analysis
- `POST /api/v1/import/csv` - Import CSV data
- `GET /api/v1/export/dashboard/{student_id}` - Export dashboard data

All endpoints return appropriate HTTP status codes and structured error responses.

### Demo Access

The application includes fictional demo data labeled as such. To access demo mode:

1. Start the application
2. Click "Demo Mode" on the landing page
3. Explore the platform with fictional student data (Aarav Patel, grade 5)

Demo data includes:
- One fictional student with multiple subjects
- Several topics per subject
- Historical assessments with mixed trends (improving, stable, declining)
- Quiz attempts before and after practice
- Attendance records over multiple months
- Assignment records
- Teacher feedback

### Development Commands

**Backend:**
- `uvicorn main:app --reload` - Start development server
- `python -m pytest` - Run backend tests
- `python -m app.admin.init-demo-data` - Initialize demo data

**Frontend:**
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Lint code

### Dataset Format and CSV Import

The application accepts CSV imports for the following data types:

**Assessments CSV:**
```
student_code,subject,assessment_name,assessment_type,max_marks,marks_obtained,assessment_date
EDU001,Mathematics,Quarterly Math Assessment,exam,100,54,2024-01-15
```

**Quizzes CSV:**
```
student_code,subject,topic,score,max_score,attempt_date,notes
EDU001,Mathematics,Fractions,16,20,2024-01-20,Initial assessment
```

**Attendance CSV:**
```
student_code,date,status
EDU001,2024-01-02,present
```

**Assignments CSV:**
```
student_code,title,assigned_date,due_date,status,score,max_score
EDU001,Fraction Operations Homework,2024-01-10,2024-01-17,submitted,18,20
```

**Study Sessions CSV:**
```
student_code,activity_type,duration_minutes,session_date,notes,quiz_score,quiz_max_score
EDU001,revision,45,2024-02-05,Reviewed fractions concepts,14,20
```

CSV import validates:
- Required column presence
- Data type correctness
- Score range validation (0 to max_marks)
- Date format validation
- Duplicate record detection
- Meaningful error reporting for each rejected row

### Limitations and Future Improvements

**Current Limitations:**
- SQLite not suitable for production deployment on ephemeral hosting filesystems
- Demo mode uses fictional data only
- Limited authentication (MVP focus on demo functionality)
- No real-time data synchronization
- Chart data limited to sample/demo dataset without backend persistence

**Future Improvements:**
- PostgreSQL deployment support
- Full authentication with password hashing
- Real student data integration
- Advanced ML predictions (when dataset supports it)
- Mobile application version
- Integration with school information systems
- Expanded language support ( additional regional languages)
- Offline data collection capability

### Security and Privacy

- Children's academic information treated as sensitive data
- Backend authorization for protected records
- Input validation and safe database queries
- Secure password handling
- Environment-based configuration
- No API keys or passwords in frontend code
- No secrets committed to Git
- Clear demo-versus-real-data labeling
- No publication of real student data in public repository

### License

This project is for portfolio and evaluation purposes. Demo data is explicitly labeled as fictional.