# Code Citations

## License: unknown
https://github.com/SylverWings/BuscadorPeliculas/blob/630cbbf9edd5f53f7cdae221b30fd686d2b79c2f/contrellers/AuthController.js

```
Looking at your code, there are two different approaches being used:

1. **`registerInstitute`** - Stores password in **Firebase Authentication** (using `admin.auth().createUser()`)
2. **`createInstitute`** - Doesn't handle passwords at all

The problem is: **There's no login endpoint to authenticate institutions!**

Here's what you need:

**For institutions, you need a login endpoint like this:**

```javascript
exports.loginInstitute = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    // Get user
```


## License: unknown
https://github.com/SylverWings/BuscadorPeliculas/blob/630cbbf9edd5f53f7cdae221b30fd686d2b79c2f/contrellers/AuthController.js

```
Looking at your code, there are two different approaches being used:

1. **`registerInstitute`** - Stores password in **Firebase Authentication** (using `admin.auth().createUser()`)
2. **`createInstitute`** - Doesn't handle passwords at all

The problem is: **There's no login endpoint to authenticate institutions!**

Here's what you need:

**For institutions, you need a login endpoint like this:**

```javascript
exports.loginInstitute = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    // Get user
```


## License: unknown
https://github.com/SylverWings/BuscadorPeliculas/blob/630cbbf9edd5f53f7cdae221b30fd686d2b79c2f/contrellers/AuthController.js

```
Looking at your code, there are two different approaches being used:

1. **`registerInstitute`** - Stores password in **Firebase Authentication** (using `admin.auth().createUser()`)
2. **`createInstitute`** - Doesn't handle passwords at all

The problem is: **There's no login endpoint to authenticate institutions!**

Here's what you need:

**For institutions, you need a login endpoint like this:**

```javascript
exports.loginInstitute = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    // Get user
```


## License: unknown
https://github.com/SylverWings/BuscadorPeliculas/blob/630cbbf9edd5f53f7cdae221b30fd686d2b79c2f/contrellers/AuthController.js

```
Looking at your code, there are two different approaches being used:

1. **`registerInstitute`** - Stores password in **Firebase Authentication** (using `admin.auth().createUser()`)
2. **`createInstitute`** - Doesn't handle passwords at all

The problem is: **There's no login endpoint to authenticate institutions!**

Here's what you need:

**For institutions, you need a login endpoint like this:**

```javascript
exports.loginInstitute = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    // Get user
```


## License: unknown
https://github.com/SylverWings/BuscadorPeliculas/blob/630cbbf9edd5f53f7cdae221b30fd686d2b79c2f/contrellers/AuthController.js

```
Looking at your code, there are two different approaches being used:

1. **`registerInstitute`** - Stores password in **Firebase Authentication** (using `admin.auth().createUser()`)
2. **`createInstitute`** - Doesn't handle passwords at all

The problem is: **There's no login endpoint to authenticate institutions!**

Here's what you need:

**For institutions, you need a login endpoint like this:**

```javascript
exports.loginInstitute = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    // Get user
```


## License: unknown
https://github.com/SylverWings/BuscadorPeliculas/blob/630cbbf9edd5f53f7cdae221b30fd686d2b79c2f/contrellers/AuthController.js

```
Looking at your code, there are two different approaches being used:

1. **`registerInstitute`** - Stores password in **Firebase Authentication** (using `admin.auth().createUser()`)
2. **`createInstitute`** - Doesn't handle passwords at all

The problem is: **There's no login endpoint to authenticate institutions!**

Here's what you need:

**For institutions, you need a login endpoint like this:**

```javascript
exports.loginInstitute = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    // Get user
```


## License: unknown
https://github.com/SylverWings/BuscadorPeliculas/blob/630cbbf9edd5f53f7cdae221b30fd686d2b79c2f/contrellers/AuthController.js

```
Looking at your code, there are two different approaches being used:

1. **`registerInstitute`** - Stores password in **Firebase Authentication** (using `admin.auth().createUser()`)
2. **`createInstitute`** - Doesn't handle passwords at all

The problem is: **There's no login endpoint to authenticate institutions!**

Here's what you need:

**For institutions, you need a login endpoint like this:**

```javascript
exports.loginInstitute = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    // Get user
```


## License: unknown
https://github.com/SylverWings/BuscadorPeliculas/blob/630cbbf9edd5f53f7cdae221b30fd686d2b79c2f/contrellers/AuthController.js

```
Looking at your code, there are two different approaches being used:

1. **`registerInstitute`** - Stores password in **Firebase Authentication** (using `admin.auth().createUser()`)
2. **`createInstitute`** - Doesn't handle passwords at all

The problem is: **There's no login endpoint to authenticate institutions!**

Here's what you need:

**For institutions, you need a login endpoint like this:**

```javascript
exports.loginInstitute = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    // Get user
```

