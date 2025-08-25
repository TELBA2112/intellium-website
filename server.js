const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

// MUHIM: Ma'lumotlarni saqlash papkasi va fayl yo'li
const isRenderEnvironment = process.env.RENDER === 'true';
console.log('Is Render Environment:', isRenderEnvironment);

// Render muhiti uchun boshqa papka, oddiy ishga tushirish uchun boshqa papka
let DATA_DIR;
if (isRenderEnvironment) {
    DATA_DIR = '/opt/render/project/data';
} else {
    DATA_DIR = path.join(__dirname, 'data');
}

const LEADS_FILE = path.join(DATA_DIR, 'leads.json');

console.log(`Ma'lumotlar papkasi: ${DATA_DIR}`);
console.log(`Leads fayli: ${LEADS_FILE}`);

// --- Ma'lumotlarni saqlash papkasini yaratish ---
try {
    if (!fs.existsSync(DATA_DIR)) {
        console.log(`Ma'lumotlar papkasi yaratilmoqda: ${DATA_DIR}`);
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // Agar fayl mavjud bo'lmasa, bo'sh ro'yxat bilan yaratamiz
    if (!fs.existsSync(LEADS_FILE)) {
        console.log(`Leads fayli yaratilmoqda: ${LEADS_FILE}`);
        fs.writeFileSync(LEADS_FILE, '[]', 'utf8');
    } else {
        // Faylni o'qib, to'g'ri JSON ekanligini tekshiramiz
        try {
            const data = fs.readFileSync(LEADS_FILE, 'utf8');
            const leads = JSON.parse(data);
            console.log(`Leads fayli muvaffaqiyatli o'qildi. Jami ${leads.length} ta yozuv bor.`);
        } catch (e) {
            console.error("Faylni o'qishda xato:", e);
            // Xato bo'lsa, yangi fayl yaratamiz
            console.log("Buzilgan fayl yangilanmoqda...");
            fs.writeFileSync(LEADS_FILE, '[]', 'utf8');
        }
    }
} catch (error) {
    console.error("Ma'lumotlar papkasini yaratishda xatolik:", error);
}

// --- YANGI: Autentifikatsiya sozlamalari ---
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'intellium2023'; // Parolni o'zgartirishingiz mumkin

// Autentifikatsiya funksiyasi
const auth = (req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (login && password && login === ADMIN_USER && password === ADMIN_PASS) {
        return next(); // Agar login va parol to'g'ri bo'lsa, keyingi qadamga o'tish
    }

    res.set('WWW-Authenticate', 'Basic realm="401"'); // Brauzerga parol so'rash oynasini chiqarishni aytish
    res.status(401).send('Autentifikatsiya talab qilinadi.'); // Xatolik xabari
};

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// --- O'ZGARTIRISH: Himoyalangan yo'llar (routes) ---
// /admin bilan boshlanadigan va /api/leads bilan bog'liq barcha so'rovlar uchun `auth` funksiyasini ishlatish
app.use('/admin.html', auth);
app.use('/admin.css', auth);
app.use('/admin.js', auth);
app.get('/api/leads', auth);
app.get('/api/leads/download', auth);

app.use(express.static(__dirname)); // Serve static files like index.html

// Ensure leads.json exists
if (!fs.existsSync(LEADS_FILE)) {
    fs.writeFileSync(LEADS_FILE, '[]', 'utf8');
}

// API to get all leads
app.get('/api/leads', auth, (req, res) => {
    try {
        const data = fs.readFileSync(LEADS_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        console.error("Leads faylini o'qishda xatolik:", err);
        res.status(500).send('Ma\'lumotlarni o\'qishda xatolik.');
    }
});

// API to submit a new lead (form submission)
app.post('/api/leads', (req, res) => {
    try {
        console.log("Kelgan ma'lumotlar:", req.body);
        
        // Ma'lumotlarni frontend jo'natgan formati bilan qabul qilish
        const newLead = {
            id: Date.now(),
            clientName: req.body.name || "",
            clientSurname: "",
            phone: req.body.phone || "",
            brandName: req.body.brand_name || "",
            personType: req.body.business_industry || "jismoniy",
            assignedTo: "tasdiqlanmagan",
            status: "yangi",
            source: req.body.source || "Noma'lum",
            date: new Date().toLocaleString('uz-UZ')
        };

        console.log("Yangi so'rov yaratildi:", newLead);

        // Ma'lumotlarni o'qish va yangi ma'lumotni qo'shish
        let leads = [];
        if (fs.existsSync(LEADS_FILE)) {
            const data = fs.readFileSync(LEADS_FILE, 'utf8');
            try {
                leads = JSON.parse(data);
                if (!Array.isArray(leads)) {
                    console.warn("Fayldagi ma'lumot massiv emas, massivga o'zgartiriladi");
                    leads = [];
                }
            } catch (e) {
                console.error("JSON parse xatosi:", e);
                leads = [];
            }
        }

        // Yangi ma'lumotni boshiga qo'shish
        leads.unshift(newLead);
        
        // Ma'lumotlarni saqlash
        fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
        console.log(`Ma'lumotlar saqlandi. Jami: ${leads.length}`);
        
        res.status(201).json(newLead);
    } catch (err) {
        console.error("Lead yozishda xatolik:", err);
        return res.status(500).send('Error saving lead.');
    }
});

// Yangi: Mijoz ma'lumotlarini yangilash uchun API
app.put('/api/leads/:id/update', auth, (req, res) => {
    const leadId = parseInt(req.params.id, 10);
    const updates = req.body;
    
    try {
        const data = fs.readFileSync(LEADS_FILE, 'utf8');
        const leads = JSON.parse(data);
        
        const leadIndex = leads.findIndex(lead => lead.id === leadId);
        
        if (leadIndex === -1) {
            return res.status(404).send('Bunday ID topilmadi.');
        }
        
        // Faqat ruxsat etilgan maydonlarni yangilash
        const allowedFields = ['assignedTo', 'status', 'clientSurname'];
        
        Object.keys(updates).forEach(key => {
            if (allowedFields.includes(key)) {
                leads[leadIndex][key] = updates[key];
            }
        });
        
        fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
        res.status(200).json(leads[leadIndex]);
    } catch (err) {
        console.error("Ma'lumotni yangilashda xatolik:", err);
        res.status(500).send('Yangilashda xatolik.');
    }
});

// API to delete a lead
app.delete('/api/leads/:id', auth, (req, res) => {
    const leadId = parseInt(req.params.id, 10);
    
    try {
        const data = fs.readFileSync(LEADS_FILE, 'utf8');
        let leads = JSON.parse(data);
        const initialLength = leads.length;
        leads = leads.filter(lead => lead.id !== leadId);

        if (leads.length === initialLength) {
            return res.status(404).send('Bunday ID topilmadi.');
        }

        fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
        res.status(200).send({ message: 'Muvaffaqiyatli o\'chirildi' });
    } catch (err) {
        console.error("O'chirishda xatolik:", err);
        res.status(500).send('O\'chirishda xatolik.');
    }
});

// API to download leads as XLSX
app.get('/api/leads/download', auth, async (req, res) => {
    try {
        const data = fs.readFileSync(LEADS_FILE, 'utf8');
        const leads = JSON.parse(data);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Mijozlar');

        // Yangi kolonka tartibiga o'tish
        worksheet.columns = [
            { header: 'Sana', key: 'date', width: 20 },
            { header: 'Ism', key: 'clientName', width: 20 },
            { header: 'Familiya', key: 'clientSurname', width: 20 },
            { header: 'Telefon', key: 'phone', width: 20 },
            { header: 'Brend Nomi', key: 'brandName', width: 25 },
            { header: 'Shaxs Turi', key: 'personType', width: 15 },
            { header: 'Operator', key: 'assignedTo', width: 20 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Manba', key: 'source', width: 20 }
        ];

        // Ustun sarlavhalarini qalin qilish
        worksheet.getRow(1).font = { bold: true };
        
        // Kolonkalarni markazga to'g'rilash
        worksheet.columns.forEach(column => {
            column.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        // Ma'lumotlarni qatorlarga qo'shish
        worksheet.addRows(leads);
        
        // Qatorlarga stil berish
        worksheet.eachRow({ includeEmpty: false }, function(row, rowNumber) {
            if (rowNumber === 1) {
                // Sarlavha qatori rangi
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFD3D3D3' }
                };
            }
            
            // Har bir katak uchun ramka
            row.eachCell({ includeEmpty: true }, function(cell) {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename=' + 'mijozlar.xlsx'
        );

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('XLSX faylini yaratishda xatolik:', error);
        res.status(500).send('Excel faylini yaratishda xatolik yuz berdi.');
    }
});

// Render.com Disk bilan bog'liq muammoni hal qilish uchun shutdown hook
process.on('SIGINT', () => {
    console.log('Server to\'xtatilmoqda...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Server to\'xtatilmoqda...');
    process.exit(0);
});

// --- O'ZGARTIRISH: Serverni to'g'ri hostda ishga tushirish ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server ${PORT} portida ishga tushdi`);
});
