const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

// --- YANGI: Ma'lumotlar saqlanadigan yo'lni aniq belgilash ---
// Render muhitidagi doimiy diskda saqlash uchun
const RENDER_ENV = process.env.RENDER === 'true';
const BASE_DIR = RENDER_ENV ? '/opt/render/project/src' : __dirname;
const DATA_DIR = path.join(BASE_DIR, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');

console.log('Muhit:', RENDER_ENV ? 'Render' : 'Mahalliy');
console.log('Ma\'lumotlar papkasi:', DATA_DIR);
console.log('Leads fayli:', LEADS_FILE);

// --- YANGI: Autentifikatsiya sozlamalari ---
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

// --- YANGI: Ma'lumotlar papkasi va faylini yaratish ---
try {
    // Papka mavjud bo'lmasa yaratish
    if (!fs.existsSync(DATA_DIR)) {
        console.log(`Ma'lumotlar papkasi yaratilmoqda: ${DATA_DIR}`);
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Fayl mavjud bo'lmasa, bo'sh array bilan yaratish
    if (!fs.existsSync(LEADS_FILE)) {
        console.log(`Leads fayli yaratilmoqda: ${LEADS_FILE}`);
        fs.writeFileSync(LEADS_FILE, '[]', 'utf8');
    } else {
        try {
            // Faylni o'qib, to'g'ri JSON formatida ekanligini tekshirish
            const data = fs.readFileSync(LEADS_FILE, 'utf8');
            const leads = JSON.parse(data);
            console.log(`Leads fayli tekshirildi. Jami: ${leads.length} ta ma'lumot.`);
        } catch (error) {
            console.error('Leads fayli buzilgan, yangi fayl yaratilmoqda:', error);
            // Fayl buzilgan bo'lsa, yangi bo'sh fayl yaratish
            fs.writeFileSync(LEADS_FILE, '[]', 'utf8');
        }
    }
} catch (error) {
    console.error('Ma\'lumotlar papkasi yoki faylini yaratishda xatolik:', error);
}

// --- API endpoints ---

// API to get all leads
app.get('/api/leads', (req, res) => {
    try {
        if (!fs.existsSync(LEADS_FILE)) {
            console.log('Leads fayli mavjud emas, bo\'sh massiv qaytariladi');
            return res.json([]);
        }

        const data = fs.readFileSync(LEADS_FILE, 'utf8');
        const leads = JSON.parse(data);
        console.log(`${leads.length} ta ma'lumot topildi`);
        res.json(leads);
    } catch (err) {
        console.error('Ma\'lumotlarni o\'qishda xatolik:', err);
        res.status(500).json({ error: 'Ma\'lumotlarni o\'qishda xatolik yuz berdi' });
    }
});

// API to submit a new lead
app.post('/api/leads', (req, res) => {
    try {
        console.log('Yangi ma\'lumot qabul qilindi:', req.body);
        
        // Yangi ma'lumot yaratish
        const newLead = {
            id: Date.now(),
            name: req.body.name,
            brand_name: req.body.brand_name,
            phone: req.body.phone,
            business_industry: req.body.business_industry || "-",
            source: req.body.source || 'direct',
            date: new Date().toLocaleString('uz-UZ')
        };
        
        // Ma'lumotlarni o'qish
        let leads = [];
        
        if (fs.existsSync(LEADS_FILE)) {
            try {
                const data = fs.readFileSync(LEADS_FILE, 'utf8');
                leads = JSON.parse(data);
                
                // Leads ma'lumotlar massiv ekanligini tekshirish
                if (!Array.isArray(leads)) {
                    console.log('Leads fayli massiv emas, yangi massiv yaratilmoqda');
                    leads = [];
                }
            } catch (e) {
                console.error('JSON formatini o\'qishda xatolik:', e);
                leads = [];
            }
        }
        
        // Yangi ma'lumotni qo'shish
        leads.unshift(newLead);
        
        // Ma'lumotlarni saqlash
        try {
            fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
            console.log(`Ma'lumot muvaffaqiyatli saqlandi. Jami: ${leads.length} ta.`);
            
            // Ma'lumotlarni qaytarish
            res.status(201).json(newLead);
        } catch (error) {
            console.error('Ma\'lumotlarni saqlashda xatolik:', error);
            res.status(500).json({ error: 'Ma\'lumotlarni saqlashda xatolik yuz berdi' });
        }
    } catch (err) {
        console.error('Kutilmagan xatolik:', err);
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

