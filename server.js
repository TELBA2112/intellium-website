const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000; // Hosting uchun PORT ni sozlash
const DATA_DIR = path.join(__dirname, 'data'); // Ma'lumotlar uchun papka
const LEADS_FILE = path.join(DATA_DIR, 'leads.json'); // leads.json faylining yangi yo'li

// --- YANGI: Ma'lumotlar papkasini va faylini yaratish ---
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(LEADS_FILE)) {
    fs.writeFileSync(LEADS_FILE, '[]', 'utf8');
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

// API to get all leads (endi himoyalangan)
app.get('/api/leads', auth, (req, res) => {
    try {
        const data = fs.readFileSync(LEADS_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        console.error("Leads faylini o'qishda xatolik:", err);
        res.status(500).send('Ma\'lumotlarni o\'qishda xatolik.');
    }
});

// API to submit a new lead (bu ochiq qoladi, parol so'ramaydi)
app.post('/api/leads', (req, res) => {
    const newLead = {
        id: Date.now(),
        name: req.body.name,
        brand_name: req.body.brand_name,
        phone: req.body.phone,
        business_industry: req.body.business_industry || '-', // Agar bo'sh bo'lsa chiziqcha qo'yadi
        source: req.body.source || 'Noma\'lum',
        date: new Date().toLocaleString('uz-UZ')
    };

    fs.readFile(LEADS_FILE, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error reading leads file.');
        }
        const leads = JSON.parse(data);
        leads.unshift(newLead); // Add new lead to the beginning
        fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2), (err) => {
            if (err) {
                console.error("Lead yozishda xatolik:", err);
                return res.status(500).send('Error saving lead.');
            }
            res.status(201).json(newLead);
        });
    });
});

// --- YANGI: So'rovni o'chirish uchun API ---
app.delete('/api/leads/:id', auth, (req, res) => {
    const leadId = parseInt(req.params.id, 10);
    fs.readFile(LEADS_FILE, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error reading leads file.');
        }
        let leads = JSON.parse(data);
        const initialLength = leads.length;
        leads = leads.filter(lead => lead.id !== leadId);

        if (leads.length === initialLength) {
            return res.status(404).send('Bunday ID topilmadi.');
        }

        fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2), (err) => {
            if (err) {
                return res.status(500).send('Error saving leads file.');
            }
            res.status(200).send({ message: 'Muvaffaqiyatli o\'chirildi' });
        });
    });
});


// API to download leads as XLSX
app.get('/api/leads/download', auth, async (req, res) => {
    try {
        const data = fs.readFileSync(LEADS_FILE, 'utf8');
        const leads = JSON.parse(data);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Mijozlar');

        worksheet.columns = [
            { header: 'Sana', key: 'date', width: 20 },
            { header: 'Ism', key: 'name', width: 25 },
            { header: 'Brend Nomi', key: 'brand_name', width: 25 },
            { header: 'Telefon', key: 'phone', width: 20 },
            { header: 'Biznes Yo\'nalishi', key: 'business_industry', width: 30 },
            { header: 'Manba', key: 'source', width: 20 }
        ];

        // Ustun sarlavhalarini qalin qilish
        worksheet.getRow(1).font = { bold: true };

        // Ma'lumotlarni qatorlarga qo'shish
        worksheet.addRows(leads);

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

// --- O'ZGARTIRISH: Serverni to'g'ri hostda ishga tushirish ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server ${PORT} portida ishga tushdi`);
});
