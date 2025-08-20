const TeacherAttendance = require('../models/TeacherAttendance');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// Utility: build date filter
function buildDateFilter(start, end) {
  const filter = {};
  if (start || end) {
    filter.date = {};
    if (start) filter.date.$gte = new Date(start);
    if (end) filter.date.$lte = new Date(end);
  }
  return filter;
}

exports.getReports = async (req, res) => {
  try {
    const start = req.query.start ? new Date(req.query.start) : null;
    const end = req.query.end ? new Date(req.query.end) : null;

    // Fetch teacher attendance records
    let filter = {};
    if (start && end) {
      filter.date = { $gte: start, $lte: end };
    }

    const attendanceRecords = await TeacherAttendance.find(filter).populate('teacher').sort({ date: -1 }).lean();

    // Group by date
    const groupedAttendance = {};
    attendanceRecords.forEach(record => {
      const dateKey = record.date.toISOString().split('T')[0];
      if (!groupedAttendance[dateKey]) groupedAttendance[dateKey] = [];
      groupedAttendance[dateKey].push(record);
    });

    res.render('attendance/attendance-reports', {
      groupedAttendance,
      user: req.session.user,
      start: req.query.start || '',
      end: req.query.end || ''
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};


// 📌 Download PDF (with styled table)
exports.downloadPDF = async (req, res) => {
  try {
    const { start, end } = req.query;
    const filter = buildDateFilter(start, end);

    const records = await TeacherAttendance.find(filter)
      .populate("teacher")
      .sort({ date: 1 });

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=teacher_attendance.pdf");
    doc.pipe(res);

    // Title
    doc.fontSize(18).fillColor("#800000").text("Teacher Attendance Report", {
      align: "center",
    });
    doc.moveDown(1.5);

    // Table headers
    const tableTop = doc.y;
    const colWidths = { date: 120, teacher: 250, status: 100 };

    doc
      .fontSize(12)
      .fillColor("#800000")
      .text("Date", 50, tableTop)
      .text("Teacher", 50 + colWidths.date, tableTop)
      .text("Status", 50 + colWidths.date + colWidths.teacher, tableTop);

    // Horizontal line
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke("#800000");

    // Table rows
    let y = tableTop + 25;
    records.forEach(r => {
      doc
        .fontSize(11)
        .fillColor("black")
        .text(new Date(r.date).toLocaleDateString("en-CA"), 50, y)
        .text(r.teacher?.fullName || "N/A", 50 + colWidths.date, y)
        .text(r.status, 50 + colWidths.date + colWidths.teacher, y);

      y += 20;
      if (y > 750) { // page break
        doc.addPage();
        y = 50;
      }
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Error generating PDF");
  }
};

// 📌 Download Excel
exports.downloadExcel = async (req, res) => {
  try {
    const { start, end } = req.query;
    const filter = buildDateFilter(start, end);

    const records = await TeacherAttendance.find(filter)
      .populate("teacher")
      .sort({ date: 1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Teacher Attendance");

    worksheet.columns = [
      { header: "Date", key: "date", width: 15 },
      { header: "Teacher", key: "teacher", width: 30 },
      { header: "Status", key: "status", width: 15 },
    ];

    // Style header row
    worksheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "800000" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    records.forEach(r => {
      worksheet.addRow({
        date: new Date(r.date).toLocaleDateString("en-CA"),
        teacher: r.teacher?.fullName || "N/A",
        status: r.status,
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=teacher_attendance.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Error generating Excel");
  }
};
