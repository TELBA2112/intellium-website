const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

// Oddiy yo'l - leads.json fayli asosiy papkada joylashgan
const LEADS_FILE = path.join(__dirname, 'leads.json');

console.log('Leads fayli joylashuvi:', LEADS_FILE);

// --- Autentifikatsiya sozlamalari ---
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'intellium2023';

// Autentifikatsiya funksiyasi
const auth = (req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (login && password && login === ADMIN_USER && password === ADMIN_PASS) {
        return next();
    }

    res.set('WWW-Authenticate', 'Basic realm="401"');
    res.status(401).send('Autentifikatsiya talab qilinadi.');
};

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// Admin panel va API yo'llari uchun autentifikatsiya
app.use('/admin.html', auth);
app.use('/admin.css', auth);
app.use('/admin.js', auth);
app.get('/api/leads', auth);
app.get('/api/leads/download', auth);

// Statik fayllarni berish
app.use(express.static(__dirname)); 

// Leads.json faylini tekshirish
try {
    if (!fs.existsSync(LEADS_FILE)) {
        console.log("Leads.json fayli mavjud emas, yangi fayl yaratilmoqda...");
        fs.writeFileSync(LEADS_FILE, '[]', 'utf8');
        console.log("Leads.json fayli yaratildi.");
    } else {
        console.log("Leads.json fayli mavjud, uning to'g'riligini tekshirish...");
        try {
            const data = fs.readFileSync(LEADS_FILE, 'utf8');
            const leads = JSON.parse(data);
            console.log(`Leads.json fayli to'g'ri. ${leads.length} ta so'rov mavjud.`);
        } catch (e) {
            console.error("Leads.json fayli buzilgan:", e.message);
            // Faylni zaxiralash
            const backupPath = path.join(__dirname, 'leads_backup.json');
            fs.copyFileSync(LEADS_FILE, backupPath);
            console.log("Mavjud fayl zaxiralandi:", backupPath);
            // Yangi fayl yaratish
            fs.writeFileSync(LEADS_FILE, '[]', 'utf8');
            console.log("Leads.json fayli qayta yaratildi.");
        }
    }
} catch (error) {
    console.error("Fayl operatsiyalarida xatolik:", error.message);
}

// API to get all leads
app.get('/api/leads', auth, (req, res) => {
    try {
        const data = fs.readFileSync(LEADS_FILE, 'utf8');
        const leads = JSON.parse(data);
        console.log(`${leads.length} ta so'rov topildi`);
        res.json(leads);
    } catch (err) {
        console.error("Leads faylini o'qishda xato:", err);
        res.status(500).json({ error: 'Ma\'lumotlarni o\'qishda xatolik' });
    }
});

// API to submit a new lead
app.post('/api/leads', (req, res) => {
    try {
        console.log("Yangi so'rov ma'lumotlari qabul qilindi:", req.body);
        
        // Yuboriladigan ma'lumotlarni tekshirish
        if (!req.body.name || !req.body.phone) {
            console.error("Majburiy maydonlar to'ldirilmagan");
            return res.status(400).json({ error: 'Ism va telefon raqam kiritilishi shart' });
        }

        const newLead = {
            id: Date.now(),
            name: req.body.name,
            brand_name: req.body.brand_name || "",
            phone: req.body.phone,
            business_industry: req.body.business_industry || "",
            source: req.body.source || 'direct',
            date: new Date().toLocaleString('uz-UZ')
        };

        console.log("Yangi so'rov strukturasi:", newLead);

        // Avval mavjud ma'lumotlarni o'qish
        let leads = [];
        try {
            const data = fs.readFileSync(LEADS_FILE, 'utf8');
            leads = JSON.parse(data);
            if (!Array.isArray(leads)) {
                console.warn("Fayl massiv emas, yangi massiv yaratildi");
                leads = [];
            }
        } catch (err) {
            console.error("Ma'lumotlarni o'qishda xatolik:", err.message);
            leads = [];
        }

        // Yangi ma'lumotni boshiga qo'shish
        leads.unshift(newLead);

        // Ma'lumotlarni saqlash
        fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
        console.log(`Yangi so'rov saqlandi. Jami so'rovlar soni: ${leads.length}`);

        res.status(201).json(newLead);
    } catch (err) {
        console.error("Xatolik yuz berdi:", err);
        res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
    }
});

// API to update lead status
app.put('/api/leads/:id/update', auth, (req, res) => {
    try {
        const leadId = parseInt(req.params.id, 10);
        
        if (!fs.existsSync(LEADS_FILE)) {
            return res.status(404).json({ error: 'Ma\'lumotlar fayli mavjud emas' });
        }
        
        const data = fs.readFileSync(LEADS_FILE, 'utf8');
        let leads = JSON.parse(data);
        
        const leadIndex = leads.findIndex(lead => lead.id === leadId);
        
        if (leadIndex === -1) {
            return res.status(404).json({ error: 'Mijoz ma\'lumotlari topilmadi' });
        }
        
        // Yangilanishi mumkin bo'lgan maydonlar
        const allowedFields = ['assignedTo', 'status', 'clientSurname'];
        
        Object.keys(req.body).forEach(key => {
            if (allowedFields.includes(key)) {
                leads[leadIndex][key] = req.body[key];
            }
        });
        
        fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
        res.status(200).json(leads[leadIndex]);
    } catch (err) {
        console.error('Ma\'lumotni yangilashda xatolik:', err);
        res.status(500).json({ error: 'Ma\'lumotni yangilashda xatolik' });
    }
});

// API to delete a lead
app.delete('/api/leads/:id', auth, (req, res) => {
    try {
        const leadId = parseInt(req.params.id, 10);
        
        if (!fs.existsSync(LEADS_FILE)) {
            return res.status(404).json({ error: 'Ma\'lumotlar fayli mavjud emas' });
        }
        
        const data = fs.readFileSync(LEADS_FILE, 'utf8');
        let leads = JSON.parse(data);
        
        const initialLength = leads.length;
        leads = leads.filter(lead => lead.id !== leadId);
        
        if (leads.length === initialLength) {
            return res.status(404).json({ error: 'Mijoz ma\'lumotlari topilmadi' });
        }
        
        fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
        res.status(200).json({ message: 'Ma\'lumot muvaffaqiyatli o\'chirildi' });
    } catch (err) {
        console.error('Ma\'lumotni o\'chirishda xatolik:', err);
        res.status(500).json({ error: 'Ma\'lumotni o\'chirishda xatolik' });
    }
});

// API to download leads as XLSX
app.get('/api/leads/download', auth, async (req, res) => {
    try {
        if (!fs.existsSync(LEADS_FILE)) {
            return res.status(404).json({ error: 'Ma\'lumotlar fayli mavjud emas' });
        }
        
        const data = fs.readFileSync(LEADS_FILE, 'utf8');
        const leads = JSON.parse(data);
        
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Mijozlar');
        
        // Jadval ustunlarini sozlash
        worksheet.columns = [
            { header: 'Sana', key: 'date', width: 20 },
            { header: 'Ism', key: 'name', width: 20 },
            { header: 'Brend Nomi', key: 'brand_name', width: 25 },
            { header: 'Telefon', key: 'phone', width: 20 },
            { header: 'Biznes Yo\'nalishi', key: 'business_industry', width: 30 },
            { header: 'Manba', key: 'source', width: 20 }
        ];
        
        // Sarlavha ustunlarini qalin qilish
        worksheet.getRow(1).font = { bold: true };
        
        // Ma'lumotlarni qo'shish
        leads.forEach(lead => {
            worksheet.addRow({
                date: lead.date || '-',
                name: lead.name || '-',
                brand_name: lead.brand_name || '-',
                phone: lead.phone || '-',
                business_industry: lead.business_industry || '-',
                source: lead.source || '-'
            });
        });
        
        // Qatorlarga stil berish
        worksheet.eachRow({ includeEmpty: false }, function(row, rowNumber) {
            row.eachCell({ includeEmpty: false }, function(cell) {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            });
            
            // Sarlavha qatori rangini o'zgartirish
            if (rowNumber === 1) {
                row.eachCell({ includeEmpty: false }, function(cell) {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFD3D3D3' }
                    };
                });
            }
        });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=mijozlar.xlsx');
        
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Excel faylini yaratishda xatolik:', err);
        res.status(500).json({ error: 'Excel faylini yaratishda xatolik' });
    }
});

// API for debugging leads.json file
app.get('/api/leads/debug', auth, (req, res) => {
    try {
        // Fayl mavjudligini tekshiramiz
        const fileExists = fs.existsSync(LEADS_FILE);
        
        if (!fileExists) {
            return res.json({
                status: "error",
                message: "Leads.json fayli mavjud emas",
                filePath: LEADS_FILE
            });
        }
        
        // Faylni o'qishga harakat qilamiz
        const data = fs.readFileSync(LEADS_FILE, 'utf8');
        
        try {
            // JSON formatida ekanini tekshiramiz
            const leads = JSON.parse(data);
            
            return res.json({
                status: "success",
                filePath: LEADS_FILE,
                fileSize: data.length,
                leads: leads,
                isArray: Array.isArray(leads),
                leadsCount: Array.isArray(leads) ? leads.length : 'N/A'
            });
        } catch (parseError) {
            return res.json({
                status: "error",
                message: "JSON formatida xatolik",
                filePath: LEADS_FILE,
                fileContent: data,
                error: parseError.message
            });
        }
    } catch (err) {
        return res.json({
            status: "error",
            message: "Faylni o'qishda xatolik",
            filePath: LEADS_FILE,
            error: err.message
        });
    }
});

// SIGTERM signalini to'g'ri boshqarish
process.on('SIGTERM', () => {
    console.log('SIGTERM signali qabul qilindi, server to\'xtatilmoqda...');
    process.exit(0);
});

// SIGINT signalini to'g'ri boshqarish
process.on('SIGINT', () => {
    console.log('SIGINT signali qabul qilindi, server to\'xtatilmoqda...');
    process.exit(0);
});

// Serverni ishga tushirish
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server http://localhost:${PORT} portida ishga tushdi`);
});

