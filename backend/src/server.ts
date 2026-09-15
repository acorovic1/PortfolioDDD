import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import type { User, AuthRequest } from './types.ts';
import type { PortfolioPiece } from '../../src/types/PortfolioPiece.ts';
import { pickPortfolioPiece } from '../../src/types/PortfolioPiece.ts';
import mysql from "mysql2";
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import multer from 'multer';

dotenv.config();

const app = express();
const port = 3001;
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'Tell me a secret';

// dal mi treba ovaj string.. tj mapa.. bolje samo array? ima vise smisla.. 
// sta cu koji kurac sa ovim stringom kad ga ne znam

// In-memory database (replace with real database in production)
const users = new Map<string, User>();
// const portfolios = new Map<string, PortfolioPiece[]>();


const createTestUsers = async () => {
  const testUsers = [
    {
      email: 'alice@test.com',
      password: 'password123',
      name: 'Alice Johnson',
      username: 'alice'
    },
    {
      email: 'bob@test.com',
      password: 'password123',
      name: 'Bob Smith',
      username: 'bob'
    },
    {
      email: 'charlie@test.com',
      password: 'password123',
      name: 'Charlie Davis',
      username: 'charlie'
    }
  ];

  for (const testUser of testUsers) {
    const hashedPassword = await bcrypt.hash(testUser.password, 10);
    const userId = uuidv4();

    const user: User = {
      id: userId,
      email: testUser.email,
      username: testUser.username,
      name: testUser.name,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      profileData: {
        avatarUrl: '/default-avatar.png',
        name: testUser.name,
        title: '3D Graphics Engineer',
        email: testUser.email,
        bio: `Hi, I'm ${testUser.name}! I love creating stunning 3D visualizations and interactive experiences.`,
        skills: ['Blender', 'Three.js', 'React', 'WebGL', 'TypeScript'],
        location: 'San Francisco, CA'
      },
      artworks: []
    };

    users.set(userId, user);

    // Create portfolio with sample data
    // portfolios.set(userId, {
    //   userId,
    //   profile: {
    //     avatarUrl: '/default-avatar.png',
    //     name: testUser.name,
    //     title: '3D Graphics Engineer',
    //     email: testUser.email,
    //     bio: `Hi, I'm ${testUser.name}! I love creating stunning 3D visualizations and interactive experiences.`,
    //     skills: ['Blender', 'Three.js', 'React', 'WebGL', 'TypeScript'],
    //     location: 'San Francisco, CA'
    //   },
    //   artworks: []
    // });
  }

  console.log('✅ Test users created:');
  testUsers.forEach(u => console.log(`   📧 ${u.email} / ${u.username} (password: password123)`));
};

// Initialize test users
createTestUsers();


const db = mysql.createConnection({
  host: process.env.HOST,
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DATABASE
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    return;
  }
  console.log('Connected to the database.');
});




// Middleware to verify JWT token
const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      res.status(403).json({ error: 'Invalid or expired token' });
      return;
    }
    (req as AuthRequest).user = decoded as { id: string; email: string; username: string };
    next();
  });
};




// Register endpoint
app.post('/api/auth/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name, username } = req.body;

    // Validation
    if (!email || !password || !name || !username) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    // Check if user already exists
    const existingUser = Array.from(users.values()).find(
      u => u.email === email || u.username === username
    );

    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userId = uuidv4();
    const user: User = {
      id: userId,
      email,
      username,
      name,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      artworks: [],
    };

    users.set(userId, user);

    // // Create default portfolio
    // portfolios.set(userId, {
    //   userId,
    //   profile: {
    //     avatarUrl: '/default-avatar.png',
    //     name,
    //     title: '3D Graphics Engineer',
    //     email,
    //     bio: '',
    //     skills: [],
    //     location: ''
    //   },
    //    artworks: []
    // });

    // Generate token
    const token = jwt.sign({ id: userId, email, username }, JWT_SECRET, {
      expiresIn: '7d'
    });

    res.json({
      token,
      user: {
        id: userId,
        email,
        username,
        name
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


// Login endpoint
app.post('/api/auth/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }

    // Find user
    const user = Array.from(users.values()).find(u => u.email === email);

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


// Get current user
app.get('/api/auth/me', authenticateToken, (req: Request, res: Response): void => {
  const authReq = req as AuthRequest;
  const user = users.get(authReq.user!.id);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name
  });
});

// Get user's portfolio
app.get('/api/portfolio', authenticateToken, (req: Request, res: Response): void => {
  const authReq = req as AuthRequest;
  const userArtworks = users.get(authReq.user!.id)?.artworks;

  if (!userArtworks) {
    res.status(404).json({ error: 'Portfolio not found' });
    return;
  }

  res.json(userArtworks);
});

// Update user's portfolio
// app.put('/api/portfolio', authenticateToken, (req: Request, res: Response): void => {
//   const authReq = req as AuthRequest;
//   const { profile, artworks } = req.body;

//   const userArtworks = users.get(authReq.user!.id)?.artworks;
//   if (!userArtworks) {
//     res.status(404).json({ error: 'Portfolio not found' });
//     return;
//   }

//   if (profile) {
//     portfolio.profile = { ...portfolio.profile, ...profile };
//   }
//   if (artworks) {
//     portfolio.artworks = artworks;
//   }

//   portfolios.set(authReq.user!.id, portfolio);

//   res.json(portfolio);
// });

// Search users
app.get('/api/users/search', authenticateToken, (req: Request, res: Response): void => {
  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.length < 2) {
    res.json({ users: [] });
    return;
  }

  const query = q.toLowerCase();
  const results = Array.from(users.values())
    .filter(user =>
      user.username.toLowerCase().includes(query) ||
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query)
    )
    .map(user => ({
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email
    }))
    .slice(0, 10);

  res.json({ users: results });
});

// Get public portfolio by username
app.get('/api/portfolio/:username', (req: Request, res: Response): void => {
  const { username } = req.params;

  const user = Array.from(users.values()).find(u => u.username === username);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const userArtworks = users.get(user.id)?.artworks;
  if (!userArtworks) {
    res.status(404).json({ error: 'Portfolio not found' });
    return;
  }

  res.json({
    user: {
      username: user.username,
      name: user.name
    },
    userArtworks
  });
});



const upload = multer({dest: 'uploads/models'});
// Add artwork to user's portfolio
app.post('/api/models/upload',authenticateToken,upload.single('model'),(req: Request, res: Response) => {

    const file = req.file;
    const { title } = req.body;

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const modelRecord = {
      id: crypto.randomUUID(),
      title,
      filePath: file.path,
      originalName: file.originalname,
      createdAt: Date.now()
    };

    models.push(modelRecord); // “DB”
    res.status(201).json(modelRecord);
  }
);

// Update artwork
app.put('/api/portfolio/artworks/:artworkId', authenticateToken, (req: Request, res: Response): void => {
  const { user: authUser } = req as AuthRequest;
  const { artworkId } = req.params;
  const { infoData, renders } = req.body;

  const userArtworks = users.get(authUser!.id)?.artworks;
  if (!userArtworks) {
    res.status(404).json({ error: 'Portfolio not found' });
    return;
  }

  const artworkIndex = userArtworks.findIndex(a => a.id === artworkId);
  if (artworkIndex === -1) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }



  if (infoData) {
    userArtworks[artworkIndex].infoData = infoData;
  }
  if (renders) {
    userArtworks[artworkIndex].renders = renders;
  }


  res.json(userArtworks[artworkIndex]);
});

// Delete artwork
app.delete('/api/portfolio/artworks/:artworkId', authenticateToken, (req: Request, res: Response): void => {
  const { user: authUser } = req as AuthRequest;
  const { artworkId } = req.params;

  const userArtworks = users.get(authUser!.id)?.artworks;
  if (!userArtworks) {
    res.status(404).json({ error: 'Portfolio not found' });
    return;
  }

  const artworkIndex = userArtworks.findIndex(a => a.id === artworkId);
  if (artworkIndex === -1) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }



  userArtworks.splice(artworkIndex, 1);


  res.json({ success: true });
});

// Add render to artwork
app.post('/api/portfolio/artworks/:artworkId/renders', authenticateToken, (req: Request, res: Response): void => {
  const { user: authUser } = req as AuthRequest;
  const { artworkId } = req.params;
  const { url, caption } = req.body;

  const userArtworks = users.get(authUser!.id)?.artworks;
  if (!userArtworks) {
    res.status(404).json({ error: 'Portfolio not found' });
    return;
  }

  const artwork = userArtworks.find(a => a.id === artworkId);
  if (!artwork) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }



  // const newRender: ArtworkRender = {
  //   id: uuidv4(),
  //   url,
  //   caption: caption || 'Untitled Render',
  //   createdAt: new Date().toISOString()
  // };

  artwork.renders.push(newRender);


  res.json(newRender);
});

// Delete render from artwork
app.delete('/api/portfolio/artworks/:artworkId/renders/:renderId', authenticateToken, (req: Request, res: Response): void => {
  const { user: authUser } = req as AuthRequest;
  const { artworkId, renderId } = req.params;

  const userArtworks = users.get(authUser!.id)?.artworks;
  if (!userArtworks) {
    res.status(404).json({ error: 'Portfolio not found' });
    return;
  }

  const artwork = userArtworks.find(a => a.id === artworkId);
  if (!artwork) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }


  const renderIndex = artwork.renders.findIndex(r => r.id === renderId);
  if (renderIndex === -1) {
    res.status(404).json({ error: 'Render not found' });
    return;
  }

  artwork.renders.splice(renderIndex, 1);


  res.json({ success: true });
});








app.get('/', (req: Request, res: Response) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});