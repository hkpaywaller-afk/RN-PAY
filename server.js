const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// मिडलवेयर (Middleware)
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

// MongoDB कनेक्शन (आपके दिए गए यूआरएल और पासवर्ड के साथ)
const MONGO_URI = 'mongodb+srv://admin12340:Rdg04hMPtCxhLmGu@cluster0.ucnyait.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(async () => {
    console.log('MongoDB Connected Successfully');
    await createDefaultAdminUser();
}).catch(err => {
    console.error('Database connection error:', err);
});

// 1. यूजर स्कीमा (User Schema)
const userSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    uid: { type: String, required: true, unique: true },
    balance: { type: Number, default: 674.22 },
    banks: [{
        holderName: String,
        accNumber: String,
        bankName: String,
        ifscCode: String,
        isActive: { type: Boolean, default: true }
    }],
    gaSecretKey: { type: String, default: '' },
    isGaBound: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// 2. आर्डर/ट्रांजेक्शन स्कीमा (Order & Token History Schema)
const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    uid: { type: String, required: true },
    type: { type: String, required: true }, // Recharge, Receive, Commission, Reward, etc.
    amount: { type: String, required: true },
    desc: { type: String, default: '' },
    bankName: { type: String, default: '' },
    accountLast4: { type: String, default: '' },
    utr: { type: String, default: '' },
    status: { type: String, default: 'success' },
    time: { type: String, required: true }
});

const Order = mongoose.model('Order', orderSchema);

// डिफ़ॉल्ट एडमिन यूजर फंक्शन (UID 20001)
async function createDefaultAdminUser() {
    try {
        const adminPhone = "9862713447";
        const existingAdmin = await User.findOne({ phone: adminPhone });
        
        if (!existingAdmin) {
            const count = await User.countDocuments();
            const nextUidNumber = 20001 + count;

            const defaultAdmin = new User({
                phone: adminPhone,
                password: "ADMIN123@",
                uid: nextUidNumber.toString(),
                balance: 5000.00
            });

            await defaultAdmin.save();
            console.log(`Default Admin User Created Successfully with UID: ${nextUidNumber} (${adminPhone})`);
        }
    } catch (error) {
        console.error('Error creating default admin:', error);
    }
}

// --- API ROUTES ---

// A. रजिस्ट्रेशन एपीआई (Register API)
app.post('/api/register', async (req, res) => {
    try {
        const { phone, password, inviteCode } = req.body;
        
        let existingUser = await User.findOne({ phone });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Phone number already registered!' });
        }

        const totalUsers = await User.countDocuments();
        const nextUid = (20001 + totalUsers).toString();
        
        const newUser = new User({
            phone,
            password,
            uid: nextUid
        });

        await newUser.save();
        res.status(201).json({ success: true, message: 'Registration successful!', uid: nextUid });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// B. लॉगिन एपीआई (Login API)
app.post('/api/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        const user = await User.findOne({ phone, password });
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid phone number or password!' });
        }

        res.status(200).json({
            success: true,
            message: 'Login successful!',
            uid: user.uid,
            phone: user.phone,
            balance: user.balance
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// C. बैंक अकाउंट सेव करने की एपीआई (Bank Management API)
app.post('/api/bank/save', async (req, res) => {
    try {
        const { phone, bankDetails } = req.body;

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found!' });
        }

        user.banks.push(bankDetails);
        await user.save();

        res.status(200).json({ success: true, message: 'Bank details saved successfully!', banks: user.banks });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// D. गूगल ऑथेंटिकेटर बाइंड करने की एपीआई (Google Authenticator API)
app.post('/api/auth/bind-ga', async (req, res) => {
    try {
        const { phone, secretKey } = req.body;

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found!' });
        }

        user.gaSecretKey = secretKey;
        user.isGaBound = true;
        await user.save();

        res.status(200).json({ success: true, message: 'Google Authenticator bound successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// E. टास्क / रीचार्ज / आर्डर सबमिट करने की एपीआई (Task & Recharge History API)
app.post('/api/order/submit', async (req, res) => {
    try {
        const { orderId, uid, type, amount, desc, bankName, accountLast4, utr } = req.body;

        const newOrder = new Order({
            orderId,
            uid,
            type: type || 'Receive',
            amount,
            desc: desc || 'Payment task completed',
            bankName: bankName || '',
            accountLast4: accountLast4 || '',
            utr: utr || '',
            status: 'success',
            time: new Date().toISOString().replace('T', ' ').substring(0, 19)
        });

        await newOrder.save();

        // यूजर का बैलेंस अपडेट करना (अगर अमाउंट प्लस में है)
        let numericAmount = parseFloat(amount.replace(/[^0-9.-]+/g,"")) || 0;
        await User.findOneAndUpdate({ uid }, { $inc: { balance: numericAmount } });

        res.status(200).json({ success: true, message: 'Task submitted and history updated successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// F. टोकन हिस्ट्री / रीचार्ज हिस्ट्री फेच करने की एपीआई (Fetch History API)
app.get('/api/history/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        const historyList = await Order.find({ uid }).sort({ _id: -1 });
        res.status(200).json({ success: true, data: historyList });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// सर्वर स्टार्ट करना
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});