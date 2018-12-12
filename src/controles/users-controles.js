'use strict';

// repositorio
const repository = require('../repositorios/users-repositorio');

// carrega os modulos
const azure = require('azure-storage');
const guid = require('guid');
const md5 = require('md5');
const ValidationContract = require('../service/validator-service');
const autentification = require('../service/auth-service');
const emailService = require('../service/email-service');

// config
const config = require('../config');

// RegEx
const regex = /^data:([A-Za-z-+\/]+);base64,(.+)$/;

// Post
exports.post = async(req, res, next) => {
    // validação dos campos
    let contract = new ValidationContract();
    contract.hasMinLen(req.body.name, 3, 'O campo nome precisa ter no mínimo 3 caracteres');
    contract.isEmail(req.body.email, 'Digite um email valido');
    contract.hasMinLen(req.body.password, 8, "A senha deve ter no mínimo 8 caracteres");
    if (!contract.isValid()) {
        res.status(400).send(contract.errors()).end();
        return;
    }
    try {     
        const valid = await repository.getByEmail(req.body.email)
        if (valid) {
            res.status(500).send({
                message: 'Este email ja esta em uso'
            })
        }   
        await repository.create({
            name: req.body.name,
            email: req.body.email,
            password: md5(req.body.password + global.Uni_KEY),
            profilePicture: 'https://thingstorage.blob.core.windows.net/profile-pictures/user-out.png',
            roles: ["user"]
        });
        const user = await repository.authenticate({
            email: req.body.email,
            password: md5(req.body.password + global.Uni_KEY)
        });
        const token = await autentification.generateToken({
            id: user._id,
            email: user.email,
            name: user.name,
            roles: user.roles
        });
        emailService.send(
            req.body.email, 
            'Bem Vindo ao Things!', 
            global.EMAIL_TMPL.replace('{0}', req.body.name)
        );
        res.status(201).send({
            message: 'Cadastro realizado com sucesso',
            token: token
        });
    } catch (e) {
        console.log(e);
        res.status(500).send({
            message: 'Erro ao cadastrar'
        });
    }
}

// Put
exports.put = async(req, res, next) => {
    try {
        // update da imagem de perfil
        let picName = guid.raw().toString() + '.jpg';
        let pic = req.body.profilePicture;
        let matches = pic.match(regex);
        let type = matches[1];
        let buffer = new Buffer(matches[2], 'base64');

        //azure-storage
        const azureSrv = azure.createBlobService(config.connectionAzure);
        //upload da foto
        await azureSrv.createBlockBlobFromText('profile-pictures', picName , buffer, { 
            contentType: type
        },function (error, result, response) {
            if (error) {
                picName = 'default-product.png';
                console.log(error);
            } else {
                console.log(result);
            }
        });

        await repository.update(req.params.id, {
            name: req.body.name,
            profilePicture: 'https://thingstorage.blob.core.windows.net/profile-pictures/' + picName
        });
        res.status(201).send({
            message: 'Atualização realizada'
        })
    } catch (e) {
        console.log(e);
        res.status(500).send({
            message: 'Erro na atualização'
        });
    }
}

// Delete
exports.remove = async(req, res, next) => {
    try {
        await repository.delete(req.body.id);
        res.status(201).send({
            message: 'Perfil excluido'
        })
    } catch (e) {
        console.log(e);
        res.status(500).send({
            message: 'Erro na exclusão'
        })
    }
}

/** Autentificação do Token *////
exports.authenticate = async(req, res, next) => {
    try {
        const user = await repository.authenticate({
            email: req.body.email,
            password: md5(req.body.password + global.Uni_KEY)
        });

        if (!user) {
            res.status(404).send ({
                message: 'Usuário e/ou senha inválidos'
            });
            return;
        }

        const token = await autentification.generateToken({
            id: user._id,
            email: user.email,
            name: user.name,
            roles: user.roles
        });

        res.status(201).send({
            token: token,
            data : {
                email: user.email,
                name : user.name
            }
        });
    } catch (e) {
        res.status(500).send({
            message: 'Falha ao processar sua requisição'
        });
    }
}

/** Cria um novo Token para substituir o antigo *////
exports.refreshToken = async(req, res, next) => {
    try {
        const token = req.body.token || req.query.token || req.headers['access-token'];
        const data = await autentification.decodeToken(token);

        const user = await repository.getByID(data.id);

        if (!user) {
            res.status(404).send ({
                message: 'Cliente não encontrado'
            });
            return;
        }

        const tokenData = await autentification.generateToken({
            id: user._id,
            email: user.email,
            name: user.name,
            roles: user.roles
        });

        res.status(201).send({
            token: tokenData,
            data : {
                email: user.email,
                name : user.name
            }
        });
    } catch (e) {
        console.log(e);
        res.status(500).send({
            message: 'Falha ao processar sua requisição'
        });
    }
}