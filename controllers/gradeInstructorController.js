const db=require('../config/database');
const service=require('../services/gradeInstructorService');
function forProgram(program){
  const endpoint=handler=>async(req,res)=>{try{await handler(req,res);}catch(error){res.status(error.status||500).json({message:error.status?error.message:'Unable to save instructor assignments. Please try again.'});}};
  return {
    list:endpoint(async(req,res)=>res.json(await service.management(db,program,req.query.schedule_id))),
    create:endpoint(async(req,res)=>res.status(201).json({message:'Instructor added.',instructor:await service.create(db,program,req.body,req.user.email)})),
    assign:endpoint(async(req,res)=>{const id=await service.assign(db,program,req.body,req.user.email);res.json({message:'Instructor assignment saved.',id});}),
    remove:endpoint(async(req,res)=>{await service.remove(db,program,req.params.id,req.user.email);res.json({message:'Instructor assignment removed.'});}),
  };
}
module.exports={forProgram};
